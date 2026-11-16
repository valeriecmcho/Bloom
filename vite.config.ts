import { defineConfig, loadEnv, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const FIGMA_ASSET_PREFIX = 'figma:asset/';
const PLACEHOLDER_IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22 viewBox=%220 0 400 400%22%3E%3Crect width=%22400%22 height=%22400%22 fill=%22%23f8e8f0%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2216%22 fill=%22%23cc5590%22%3EImage%3C/text%3E%3C/svg%3E';

function figmaAssetPlugin(): Plugin {
  return {
    name: 'figma-asset-resolver',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith(FIGMA_ASSET_PREFIX)) {
        return `\0figma-asset:${source}`;
      }
    },
    load(id) {
      if (id.startsWith('\0figma-asset:')) {
        const filename = id.replace('\0figma-asset:figma:asset/', '');
        const localAsset = path.resolve(__dirname, 'src/assets', filename);
        if (fs.existsSync(localAsset)) {
          return `import img from ${JSON.stringify(localAsset)};\nexport default img;`;
        }
        return `export default "${PLACEHOLDER_IMG}";`;
      }
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string | Buffer) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const mockSessions = new Map<string, { paymentStatus: string; paymentMethod: string; referenceId: string; amount: number }>();

function paymongoApiPlugin(secretKey: string): Plugin {
  const isMockKey = !secretKey || secretKey.includes('REPLACE_WITH_YOUR_KEY') || secretKey === 'mock';
  const authHeader = (!isMockKey && secretKey)
    ? 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
    : '';

  return {
    name: 'paymongo-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        // Only intercept /api/* routes
        if (!url.pathname.startsWith('/api/')) {
          return next();
        }

        if (url.pathname === '/api/create-checkout' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req));
            const { billing, line_items, orderId } = body;

            const host = req.headers.host || 'localhost:5173';
            const protocol = host.includes('localhost') ? 'http' : 'https';
            const success_url = `${protocol}://${host}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`;
            const cancel_url = `${protocol}://${host}/checkout`;

            if (isMockKey) {
              const mockSessionId = `mock_session_${Date.now()}`;
              const totalAmount = line_items?.reduce(
                (sum: number, item: { amount: number; quantity: number }) => sum + (item.amount || 0) * (item.quantity || 1), 0
              ) || 0;
              mockSessions.set(mockSessionId, {
                paymentStatus: 'paid',
                paymentMethod: 'gcash (demo mode)',
                referenceId: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
                amount: totalAmount,
              });

              return sendJson(res, 200, {
                checkout_url: success_url.replace('{CHECKOUT_SESSION_ID}', mockSessionId),
                session_id: mockSessionId,
              });
            }

            const pmResponse = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({
                data: {
                  attributes: {
                    billing: { name: billing.name, email: billing.email, phone: billing.phone },
                    line_items: line_items.map((item: { name: string; amount: number; quantity: number }) => ({
                      name: item.name,
                      amount: item.amount,
                      currency: 'PHP',
                      quantity: item.quantity,
                    })),
                    payment_method_types: ['gcash', 'paymaya', 'card', 'qrph', 'billease', 'dob', 'dob_ubp'],
                    success_url,
                    cancel_url,
                    description: `Bloom Order ${orderId || ''}`.trim(),
                    send_email_receipt: true,
                    show_description: true,
                    show_line_items: true,
                  },
                },
              }),
            });

            const data = await pmResponse.json();
            if (!pmResponse.ok) {
              console.error('PayMongo error:', JSON.stringify(data));
              return sendJson(res, 500, { error: data.errors?.[0]?.detail || 'Failed to create checkout session' });
            }
            return sendJson(res, 200, { checkout_url: data.data.attributes.checkout_url, session_id: data.data.id });
          } catch (error) {
            console.error('Create checkout error:', error);
            return sendJson(res, 500, { error: 'Failed to create checkout session' });
          }
        }

        if (url.pathname === '/api/get-session' && req.method === 'GET') {
          try {
            const session_id = url.searchParams.get('session_id');
            if (!session_id) {
              return sendJson(res, 400, { error: 'session_id is required' });
            }

            if (session_id.startsWith('mock_session_') || isMockKey) {
              const mockSession = mockSessions.get(session_id) || {
                paymentStatus: 'paid',
                paymentMethod: 'gcash (demo mode)',
                referenceId: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
                amount: 0,
              };
              return sendJson(res, 200, mockSession);
            }

            const pmResponse = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${session_id}`, {
              method: 'GET',
              headers: { Authorization: authHeader },
            });

            const data = await pmResponse.json();
            if (!pmResponse.ok) {
              console.error('PayMongo session error:', JSON.stringify(data));
              return sendJson(res, 500, { error: data.errors?.[0]?.detail || 'Failed to retrieve session' });
            }

            const attributes = data.data.attributes;
            const payments = attributes.payments || [];
            const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

            const intentStatus = attributes.payment_intent?.attributes?.status;
            const sessionStatus = attributes.status;
            const latestPaymentStatus = latestPayment?.attributes?.status;

            let paymentStatus: string;
            if (intentStatus === 'succeeded' || latestPaymentStatus === 'paid') {
              paymentStatus = 'paid';
            } else if (sessionStatus === 'expired' || latestPaymentStatus === 'failed') {
              paymentStatus = 'failed';
            } else {
              paymentStatus = 'pending';
            }

            const paymentMethod =
              latestPayment?.attributes?.source?.type ||
              latestPayment?.attributes?.payment_method_used ||
              '';
            const referenceId = latestPayment?.id || '';
            const amount = attributes.line_items?.reduce(
              (sum: number, item: { amount: number; quantity: number }) => sum + item.amount * item.quantity, 0
            ) || 0;

            return sendJson(res, 200, { paymentStatus, paymentMethod, referenceId, amount });
          } catch (error) {
            console.error('Get session error:', error);
            return sendJson(res, 500, { error: 'Failed to retrieve payment session' });
          }
        }

        if (url.pathname === '/api/refund' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req));
            const { payment_id, amount, reason } = body;

            if (!payment_id || !amount) {
              return sendJson(res, 400, { error: 'payment_id and amount are required' });
            }

            if (isMockKey) {
              return sendJson(res, 200, { success: true, refund: { id: `ref_mock_${Date.now()}`, status: 'refunded' } });
            }

            const pmResponse = await fetch('https://api.paymongo.com/v1/refunds', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({
                data: { attributes: { amount, payment_id, reason: reason || 'requested_by_customer' } },
              }),
            });

            const data = await pmResponse.json();
            if (!pmResponse.ok) {
              console.error('PayMongo refund error:', JSON.stringify(data));
              return sendJson(res, 500, { error: data.errors?.[0]?.detail || 'Refund failed' });
            }
            return sendJson(res, 200, { success: true, refund: data.data });
          } catch (error) {
            console.error('Refund error:', error);
            return sendJson(res, 500, { error: 'Failed to process refund' });
          }
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const paymongoKey = env.PAYMONGO_SECRET_KEY || '';

  if (!paymongoKey || paymongoKey.includes('REPLACE_WITH_YOUR_KEY')) {
    console.log('\n💡 [PayMongo Dev Mode] Mock/Demo Checkout active.');
    console.log('   Checkout will succeed instantly and redirect to the order confirmation page.');
    console.log('   To test real PayMongo payments, set a valid PAYMONGO_SECRET_KEY in your .env file.\n');
  }

  return {
    plugins: [
      figmaAssetPlugin(),
      react(),
      tailwindcss(),
      // Always mount the API middleware so /api/* routes return proper errors
      // even when the key is missing (instead of a confusing "Failed to fetch")
      paymongoApiPlugin(paymongoKey),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  };
})
