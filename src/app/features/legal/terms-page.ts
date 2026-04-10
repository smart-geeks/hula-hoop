import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen grid-bg">
      <div class="mx-auto max-w-4xl px-6 py-16">

        <!-- Breadcrumb -->
        <a routerLink="/" class="inline-flex items-center gap-2 text-sm font-bold text-[#686ABB] hover:opacity-70 mb-8 transition-opacity">
          <i class="pi pi-arrow-left"></i> Volver al inicio
        </a>

        <h1 class="font-bubblegum text-5xl md:text-7xl font-black uppercase text-[#686ABB] mb-10">
          Términos y Condiciones
        </h1>

        <div class="prose max-w-none text-gray-700 space-y-6 font-body text-base leading-relaxed">

          <p><strong>Última actualización:</strong> {{ year }}</p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">1. Aceptación de los Términos</h2>
          <p>
            Al realizar una reservación o utilizar los servicios de <strong>Hula Hoop Playground</strong>,
            usted acepta quedar obligado por los presentes Términos y Condiciones. Si no está de acuerdo,
            le pedimos que no haga uso de nuestros servicios.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">2. Descripción del Servicio</h2>
          <p>Hula Hoop Playground ofrece:</p>
          <ul class="list-disc list-inside space-y-1">
            <li><strong>Fiestas Privadas:</strong> renta del espacio y sus instalaciones para celebraciones infantiles con paquetes personalizados.</li>
            <li><strong>Play Day:</strong> acceso al área de juegos con pase de admisión general por tiempo determinado.</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">3. Reservaciones y Pagos</h2>
          <ul class="list-disc list-inside space-y-1">
            <li>Toda reservación requiere un anticipo para ser confirmada.</li>
            <li>El saldo restante deberá liquidarse previo o el día del evento.</li>
            <li>Los pagos son procesados de forma segura a través de plataformas autorizadas.</li>
            <li>Hula Hoop Playground se reserva el derecho de cancelar reservaciones no confirmadas con pago.</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">4. Política de Cancelación</h2>
          <ul class="list-disc list-inside space-y-1">
            <li>Cancelaciones con más de 7 días de anticipación: reembolso del 80% del anticipo.</li>
            <li>Cancelaciones con menos de 7 días: no se realizan reembolsos del anticipo.</li>
            <li>Cambios de fecha sujetos a disponibilidad y solicitados con al menos 72 horas de anticipación.</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">5. Responsabilidad y Seguridad</h2>
          <p>
            Los padres o tutores son responsables de la supervisión de los menores durante su estancia en las
            instalaciones. Hula Hoop Playground no se hace responsable por accidentes derivados del incumplimiento
            de las normas de seguridad del espacio.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">6. Normas de Uso del Espacio</h2>
          <ul class="list-disc list-inside space-y-1">
            <li>No se permite el ingreso de alimentos o bebidas externos salvo previo acuerdo.</li>
            <li>Se prohíbe el uso de pirotecnia o cualquier elemento que represente riesgo.</li>
            <li>El cliente es responsable de cualquier daño a las instalaciones causado por sus invitados.</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">7. Propiedad Intelectual</h2>
          <p>
            Todos los contenidos, imágenes, logotipos y diseños presentes en este sitio web son propiedad de
            Hula Hoop Playground y están protegidos por las leyes de propiedad intelectual aplicables.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">8. Modificaciones</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones
            entrarán en vigor desde su publicación en este sitio.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">9. Contacto</h2>
          <p>
            Para cualquier duda sobre estos términos, contáctenos vía WhatsApp al <strong>871 123 4567</strong>
            o por correo a <strong>hola&#64;hulahoop.mx</strong>.
          </p>

        </div>
      </div>
    </div>
  `,
})
export class TermsPage {
  readonly year = new Date().getFullYear();
}
