/**
 * Cloudflare Pages Function — POST /api/submit
 * Receives the inquiry JSON, screens spam, and sends two emails via Resend:
 *   1. Full submission → the farm (hello@simplelittleflowers.com)
 *   2. Auto-reply confirmation → the inquirer
 *
 * Required environment variables (Pages → Settings → Environment variables):
 *   RESEND_API_KEY   — API key from resend.com
 *   FROM_EMAIL       — a verified sender on your domain, e.g. "inquiries@simplelittleflowers.com"
 * Optional:
 *   TO_EMAIL         — where inquiries land (default hello@simplelittleflowers.com)
 *   FARM_NAME        — display name (default "Simple Little Flowers")
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // --- Spam trap: honeypot filled → pretend success, send nothing ---
  if (data.hp_field) return json({ ok: true });

  // --- Minimal server-side validation ---
  const email = String(data.email || '').trim();
  const first = String(data.first_name || '').trim();
  if (!first || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Missing required contact details.' }, 422);
  }

  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    return json({ error: 'Email is not configured yet. Please email hello@simplelittleflowers.com.' }, 500);
  }

  const farmName = env.FARM_NAME || 'Simple Little Flowers';
  const toEmail = env.TO_EMAIL || 'hello@simplelittleflowers.com';
  const fromEmail = env.FROM_EMAIL;
  const fullName = [first, data.last_name].filter(Boolean).join(' ').trim() || first;

  // --- Decision-critical fields for the subject line ---
  const date = data.event_date || 'no date';
  const budget = data.budget || 'no budget';
  const service = data.service_level || 'service TBD';
  const location = data.venue_location || 'location TBD';
  const type = data.event_type === 'Other' ? (data.event_type_other || 'Other') : (data.event_type || 'Event');

  const subject = `New ${type} inquiry — ${date} · ${budget} · ${service} · ${location}`;

  // --- Auto-flags ---
  const flags = buildFlags(data);

  const notifyHtml = renderNotification({ farmName, fullName, data, flags });
  const replyHtml = renderAutoReply({ farmName, first });

  try {
    // 1) Notification to the farm
    const notify = await sendEmail(env.RESEND_API_KEY, {
      from: `${farmName} Inquiries <${fromEmail}>`,
      to: [toEmail],
      reply_to: email,
      subject,
      html: notifyHtml,
    });
    if (!notify.ok) {
      const detail = await notify.text();
      return json({ error: 'Could not send the inquiry. ' + detail }, 502);
    }

    // 2) Auto-reply to the inquirer (best-effort; don't fail the request if this bounces)
    await sendEmail(env.RESEND_API_KEY, {
      from: `${farmName} <${fromEmail}>`,
      to: [email],
      reply_to: toEmail,
      subject: `We received your inquiry — ${farmName}`,
      html: replyHtml,
    }).catch(() => {});

    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Unexpected error sending email.' }, 500);
  }
}

// ---- Resend ----
function sendEmail(apiKey, payload) {
  return fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

// ---- Auto-flags worth surfacing ----
function buildFlags(d) {
  const out = [];
  const lowest = d.budget === 'Under $500';
  if (lowest && d.service_level === 'Full-service design') {
    out.push('Lowest budget bracket paired with full-service design.');
  }
  if (d.substitutions === 'No, I need specific varieties') {
    out.push('Wants specific varieties — no seasonal substitutions.');
  }
  if (d.date_status && d.date_status !== 'Locked in') {
    out.push('Date is not locked in.');
  }
  if (d.venue_booked === 'Not started') {
    out.push('Venue not booked yet.');
  }
  return out;
}

// ---- Email HTML ----
function renderNotification({ farmName, fullName, data, flags }) {
  const rows = [];
  const add = (label, value) => {
    if (value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0)) return;
    rows.push(row(label, value));
  };

  const items = Array.isArray(data.items)
    ? data.items.map((i) => `${esc(i.item)} × ${esc(i.qty)}`).join('<br>')
    : '';

  const section = (title) =>
    `<tr><td colspan="2" style="padding:22px 0 6px;font:600 12px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7f62;border-bottom:1px solid #ede8df">${title}</td></tr>`;

  let body = '';

  if (flags.length) {
    body += `<tr><td colspan="2" style="padding:0 0 18px">
      <table width="100%" style="background:#fbf3f0;border:1px solid #a3543d;border-radius:6px"><tr>
        <td style="padding:12px 16px;font:600 13px/1.5 Arial,sans-serif;color:#a3543d">
          ⚑ Worth a look before you reply<br>
          <span style="font-weight:400">• ${flags.map(esc).join('<br>• ')}</span>
        </td></tr></table></td></tr>`;
  }

  body += section('Contact');
  body += row('Name', fullName);
  add('Partner', data.partner_name);
  body += row('Email', `<a href="mailto:${esc(data.email)}">${esc(data.email)}</a>`);
  add('Phone', data.phone);
  add('Preferred contact', data.contact_pref);
  add('Heard about us via', data.referral_source);

  body += section('Event');
  add('Type', data.event_type === 'Other' ? data.event_type_other : data.event_type);
  add('Date', data.event_date);
  add('Date status', data.date_status);
  add('Alternate dates', data.alt_dates);
  add('Start time', data.event_time);
  add('Guest count', data.guest_count);
  add('Tables needing flowers', data.table_count);

  body += section('Venue & service');
  add('Venue', data.venue_name);
  add('Location', data.venue_location);
  add('Venue booked', data.venue_booked);
  add('Delivery & setup', data.delivery_needed);
  add('Access / timing notes', data.venue_restrictions);
  add('Level of service', data.service_level);

  body += section('Flowers & style');
  if (items) body += row('Items needed', items);
  add('Other items', data.items_other);
  add('Color palette', data.color_palette);
  add('Style', arr(data.style));
  add('Inspiration', data.inspiration_links);
  add('Must-haves', data.must_haves);
  add('Avoid / allergies', data.avoid);
  add('Substitutions', data.substitutions);
  add('Local / in-season focus', data.local_focus);

  body += section('Budget & planning');
  add('Budget', data.budget);
  add('Budget flexibility', data.budget_flex);
  add('Working with planner', data.has_planner);
  add('Planner contact', data.planner_contact);
  add('Vendors booked', arr(data.other_vendors_booked));
  add('Planning stage', data.planning_stage);
  add('Notes', data.notes);

  body += section('Admin');
  add('Newsletter opt-in', data.newsletter);
  add('Photo permission', data.photo_permission);
  add('Acknowledged inquiry', data.ack_inquiry);
  add('Submitted at', data.submitted_at);
  add('Source', data.utm_source);

  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;padding:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fffcf9;border:1px solid #e4ddd0;border-radius:8px">
      <tr><td style="padding:28px 28px 8px">
        <div style="font:600 12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a69e94">${esc(farmName)} · New inquiry</div>
        <h1 style="margin:8px 0 0;font:300 26px/1.2 Georgia,serif;color:#3e352e">${esc(fullName)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" style="font:400 14px/1.5 Arial,sans-serif;color:#3e352e">
          ${body}
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding:8px 12px 8px 0;font:600 13px/1.5 Arial,sans-serif;color:#6b5b4f;vertical-align:top;width:180px">${esc(label)}</td>
    <td style="padding:8px 0;font:400 14px/1.5 Arial,sans-serif;color:#3e352e;vertical-align:top">${value}</td>
  </tr>`;
}

function renderAutoReply({ farmName, first }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;padding:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf9;border:1px solid #e4ddd0;border-radius:8px">
      <tr><td style="padding:36px 32px">
        <div style="font:600 12px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b7f62">${esc(farmName)}</div>
        <h1 style="margin:14px 0 16px;font:300 28px/1.15 Georgia,serif;color:#3e352e">Thank you, ${esc(first)} —<br>your inquiry is in.</h1>
        <p style="margin:0 0 16px;font:400 15px/1.65 Arial,sans-serif;color:#6b5b4f">
          We read every inquiry ourselves, so it may take a few days. We'll be in touch within
          <strong style="color:#3e352e">3–5 business days</strong> to talk through your event and what's in season.
        </p>
        <p style="margin:0 0 16px;font:400 15px/1.65 Arial,sans-serif;color:#6b5b4f">
          A reminder: this is an inquiry, and it doesn't hold your date yet — we'll get to that together.
        </p>
        <p style="margin:0 0 24px;font:400 15px/1.65 Arial,sans-serif;color:#6b5b4f">
          In the meantime, come see what's blooming and how we work.
        </p>
        <a href="https://instagram.com/" style="display:inline-block;background:#6b7f62;color:#fff;text-decoration:none;font:700 13px/1 Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:14px 26px;border-radius:2px">See our Instagram</a>
        <p style="margin:28px 0 0;font:400 13px/1.6 Arial,sans-serif;color:#a69e94">
          Questions in the meantime? Just reply to this email.<br>
          ${esc(farmName)} · Northwest Arkansas
        </p>
      </td></tr>
    </table>
  </body></html>`;
}

// ---- utils ----
function arr(v) { return Array.isArray(v) ? v.join(', ') : (v || ''); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
// Pages returns 405 automatically for any method other than POST,
// because only onRequestPost is exported.
