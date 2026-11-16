import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventType = event?.data?.attributes?.type;

    switch (eventType) {
      // Checkout session events
      case 'checkout_session.payment.paid': {
        const sessionId = event.data?.attributes?.data?.id;
        const amount = event.data?.attributes?.data?.attributes?.amount;
        console.log(`[Webhook] Checkout session paid - Session: ${sessionId}, Amount: ${amount}`);
        break;
      }
      case 'checkout_session.payment.failed': {
        const sessionId = event.data?.attributes?.data?.id;
        console.log(`[Webhook] Checkout session payment failed - Session: ${sessionId}`);
        break;
      }

      // Payment intent / payment events
      case 'payment.paid': {
        const paymentId = event.data?.attributes?.data?.id;
        const amount = event.data?.attributes?.data?.attributes?.amount;
        const method = event.data?.attributes?.data?.attributes?.source?.type;
        console.log(`[Webhook] Payment paid - ID: ${paymentId}, Amount: ${amount}, Method: ${method}`);
        break;
      }
      case 'payment.failed': {
        const paymentId = event.data?.attributes?.data?.id;
        const failureCode = event.data?.attributes?.data?.attributes?.failed_code;
        console.log(`[Webhook] Payment failed - ID: ${paymentId}, Reason: ${failureCode}`);
        break;
      }
      case 'payment.refunded': {
        const paymentId = event.data?.attributes?.data?.id;
        const refundAmount = event.data?.attributes?.data?.attributes?.refunds?.[0]?.amount;
        console.log(`[Webhook] Payment refunded - ID: ${paymentId}, Refund amount: ${refundAmount}`);
        break;
      }

      // Link events (if using PayMongo Links)
      case 'link.payment.paid': {
        const linkId = event.data?.attributes?.data?.id;
        console.log(`[Webhook] Link payment paid - Link ID: ${linkId}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    // Always return 200 so PayMongo doesn't retry
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent PayMongo from retrying on our processing errors
    return res.status(200).json({ received: true });
  }
}
