export const MESSAGING_PRODUCT = 'whatsapp';
export const DEFAULT_GRAPH_API_VERSION = 'v25.0';

export class WhatsAppSendError extends Error {
  constructor(message, { status = null, details = null } = {}) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.status = status;
    this.details = details;
  }
}

export function buildTextMessage({ to, text }) {
  return {
    messaging_product: MESSAGING_PRODUCT,
    to,
    type: 'text',
    text: {
      body: text,
    },
  };
}

export function buildReplyButtonMessage({ to, body, buttons }) {
  return {
    messaging_product: MESSAGING_PRODUCT,
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: body,
      },
      action: {
        buttons: buttons.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };
}

export function buildListMessage({ to, body, buttonText = 'Open menu', sectionTitle, rows }) {
  return {
    messaging_product: MESSAGING_PRODUCT,
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: body,
      },
      action: {
        button: buttonText,
        sections: [
          {
            title: sectionTitle,
            rows: rows.map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description,
            })),
          },
        ],
      },
    },
  };
}

export async function sendWhatsAppMessage(
  payload,
  {
    accessToken,
    phoneNumberId,
    graphVersion = DEFAULT_GRAPH_API_VERSION,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (!accessToken) throw new WhatsAppSendError('WHATSAPP_CLOUD_ACCESS_TOKEN is required to send replies');
  if (!phoneNumberId) throw new WhatsAppSendError('WHATSAPP_PHONE_NUMBER_ID is required to send replies');
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new WhatsAppSendError('WHATSAPP_GRAPH_API_VERSION must look like v25.0');
  }
  if (typeof fetchImpl !== 'function') throw new WhatsAppSendError('fetch implementation is required');

  const response = await fetchImpl(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    const apiMessage = responseBody?.error?.message;
    throw new WhatsAppSendError(
      `WhatsApp Cloud API reply failed: HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : ''}`,
      {
        status: response.status,
        details: responseBody,
      },
    );
  }

  return responseBody;
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
