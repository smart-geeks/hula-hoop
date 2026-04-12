import { Injectable } from '@angular/core';

export interface ReservationPrintData {
  type: 'private' | 'playdate';
  statusLabel: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  reservation_date: string;        // already formatted, e.g. "25 abr 2026"
  time_slot_label: string;         // e.g. "3:30 PM – 6:30 PM"
  guest_count_label: string;       // e.g. "60 invitados"
  snack_name?: string | null;
  notes?: string | null;
  extras?: { name: string; quantity: number; unit_price_cents: number; pay_at_venue: boolean }[];
  subtotal_cents: number;
  total_cents: number;
  paid_deposit_cents: number;
  liquidation_date?: string | null; // already formatted
  access_token: string;
}

@Injectable({ providedIn: 'root' })
export class ReservationPrintService {

  private fmt(cents: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  print(data: ReservationPrintData): void {
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) return;
    win.document.write(this.buildHtml(data));
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  getWhatsAppUrl(data: ReservationPrintData): string {
    const link = `${window.location.origin}/reserva/${data.access_token}`;
    const firstName = data.guest_name.split(' ')[0];
    const remaining = Math.max(0, data.total_cents - data.paid_deposit_cents);

    const lines = [
      `¡Hola ${firstName}! 🎉`,
      ``,
      `Aquí tienes tu comprobante de reserva en *Hula Hoop*:`,
      ``,
      `📅 Fecha: ${data.reservation_date}`,
      `🕐 Horario: ${data.time_slot_label}`,
      `💰 Total: ${this.fmt(data.total_cents)}`,
      data.paid_deposit_cents > 0 ? `✅ Abonado: ${this.fmt(data.paid_deposit_cents)}` : null,
      remaining > 0 ? `💳 Restante: ${this.fmt(remaining)}` : null,
      ``,
      `👉 Consulta todos los detalles aquí:`,
      link,
      ``,
      `¡Nos vemos pronto, será una fiesta increíble! 🎊`,
    ].filter((l): l is string => l !== null).join('\n');

    // Format Mexican phone number to international (52 + 10 digits)
    const digits = data.guest_phone.replace(/\D/g, '');
    const intlPhone = digits.length === 10 ? `52${digits}` : digits;

    return `https://wa.me/${intlPhone}?text=${encodeURIComponent(lines)}`;
  }

  private buildHtml(data: ReservationPrintData): string {
    const typeLabel = data.type === 'private' ? 'Fiesta Privada' : 'Play Day';
    const remaining = Math.max(0, data.total_cents - data.paid_deposit_cents);
    const hasExtras = !!data.extras?.length;
    const hasPartial = data.paid_deposit_cents > 0;

    const extrasRows = hasExtras
      ? data.extras!.map(e => `
          <tr>
            <td>${e.name} x ${e.quantity}</td>
            <td class="right">${e.pay_at_venue ? '<span class="muted">Cobro en local</span>' : this.fmt(e.unit_price_cents * e.quantity)}</td>
          </tr>`).join('')
      : '';

    const extrasSection = hasExtras ? `
      <section>
        <h3>Extras</h3>
        <table>${extrasRows}</table>
      </section>
      <hr />` : '';

    const partialSection = hasPartial ? `
      <hr />
      <table>
        <tr class="row-abonado">
          <td>Abonado</td>
          <td class="right">${this.fmt(data.paid_deposit_cents)}</td>
        </tr>
        <tr class="row-restante">
          <td>
            Restante por pagar
            ${data.liquidation_date ? `<div class="liq-note">Máximo liquidar: ${data.liquidation_date}</div>` : ''}
          </td>
          <td class="right">${this.fmt(remaining)}</td>
        </tr>
      </table>` : '';

    const snackField = data.snack_name
      ? `<div class="field"><label>Merienda</label><p>${data.snack_name}</p></div>`
      : '';
    const notesField = data.notes
      ? `<div class="field span2"><label>Notas</label><p>${data.notes}</p></div>`
      : '';
    const subtotalRow = data.subtotal_cents !== data.total_cents
      ? `<tr><td class="muted">Paquete</td><td class="right">${this.fmt(data.subtotal_cents)}</td></tr>`
      : '';

    const link = `${window.location.origin}/reserva/${data.access_token}`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reserva – Hula Hoop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 14px; color: #111827; background: #fff;
      padding: 36px; max-width: 600px; margin: auto;
    }
    /* ── header ── */
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
    .logo-img { height: 56px; width: auto; display: block; margin: 0 auto 6px; }
    .tagline { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    /* ── badges ── */
    .badges { display: flex; gap: 8px; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 3px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge-dark { background: #111827; color: #fff; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-gray  { background: #f3f4f6; color: #6b7280; }
    /* ── grid ── */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; margin-bottom: 20px; }
    .field label { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field p { font-weight: 500; line-height: 1.4; }
    .span2 { grid-column: span 2; }
    /* ── dividers & sections ── */
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    section h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
    /* ── tables ── */
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; vertical-align: top; font-size: 14px; }
    td.right { text-align: right; white-space: nowrap; }
    .muted { color: #9ca3af; font-size: 13px; }
    /* ── total row ── */
    .row-total td { font-size: 18px; font-weight: 800; padding-top: 10px; }
    .row-total td.right { color: #dc2626; }
    /* ── abonado / restante ── */
    .row-abonado td { color: #15803d; font-weight: 600; }
    .row-restante td { color: #d97706; font-size: 13px; }
    .liq-note { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    /* ── footer ── */
    .footer {
      margin-top: 28px; padding-top: 16px; border-top: 1px dashed #e5e7eb;
      text-align: center; font-size: 11px; color: #9ca3af;
    }
    .footer a { color: #dc2626; word-break: break-all; }
    .footer .brand { font-weight: 700; margin-top: 10px; font-size: 12px; color: #6b7280; }
    @media print {
      body { padding: 0; }
      .footer a { color: #dc2626; }
    }
  </style>
</head>
<body>

  <div class="header">
    <img src="https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/general/logo.png"
         alt="Hula Hoop" class="logo-img" />
    <div class="tagline">Comprobante de reserva</div>
  </div>

  <div class="badges">
    <span class="badge badge-dark">${typeLabel}</span>
    <span class="badge badge-green">${data.statusLabel}</span>
  </div>

  <div class="grid">
    <div class="field"><label>Cliente</label><p>${data.guest_name}</p></div>
    <div class="field"><label>Teléfono</label><p>${data.guest_phone}</p></div>
    <div class="field"><label>Email</label><p>${data.guest_email}</p></div>
    <div class="field"><label>Fecha</label><p>${data.reservation_date}</p></div>
    <div class="field"><label>Turno</label><p>${data.time_slot_label}</p></div>
    <div class="field"><label>${data.type === 'private' ? 'Invitados' : 'Personas'}</label><p>${data.guest_count_label}</p></div>
    ${snackField}
    ${notesField}
  </div>

  <hr />

  ${extrasSection}

  <table>
    ${subtotalRow}
    <tr class="row-total">
      <td>Total</td>
      <td class="right">${this.fmt(data.total_cents)}</td>
    </tr>
  </table>

  ${partialSection}

  <div class="footer">
    <p>Consulta tu reserva en línea:</p>
    <a href="${link}">${link}</a>
    <div class="brand">Hula Hoop · ¡Gracias por confiar en nosotros! 🎉</div>
  </div>

</body>
</html>`;
  }
}
