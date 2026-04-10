import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-page',
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
          Aviso de Privacidad
        </h1>

        <div class="prose max-w-none text-gray-700 space-y-6 font-body text-base leading-relaxed">

          <p><strong>Última actualización:</strong> {{ year }}</p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">1. Identidad del Responsable</h2>
          <p>
            <strong>Hula Hoop Playground</strong>, con domicilio en Edificio Feliciano Chabot #1645, Torreón, Coahuila,
            México, es el responsable del tratamiento de sus datos personales conforme a la Ley Federal de Protección
            de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">2. Datos Personales que Recabamos</h2>
          <p>Para llevar a cabo las finalidades descritas en el presente aviso de privacidad, utilizaremos los siguientes datos personales:</p>
          <ul class="list-disc list-inside space-y-1">
            <li>Nombre completo del titular y de los menores a su cargo</li>
            <li>Número de teléfono y correo electrónico</li>
            <li>Información de pago (procesada de forma segura por terceros autorizados)</li>
            <li>Fecha y detalles del evento o reservación</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">3. Finalidades del Tratamiento</h2>
          <p>Sus datos personales serán utilizados para:</p>
          <ul class="list-disc list-inside space-y-1">
            <li>Procesar y confirmar reservaciones de fiestas privadas y Play Day</li>
            <li>Enviar confirmaciones, recordatorios y comunicaciones relacionadas con su evento</li>
            <li>Atender consultas y solicitudes de soporte</li>
            <li>Mejorar nuestros servicios y experiencia de usuario</li>
          </ul>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">4. Transferencia de Datos</h2>
          <p>
            Hula Hoop Playground no vende, alquila ni comparte información personal con terceros, salvo cuando sea
            necesario para prestar el servicio o cuando lo exija la ley aplicable.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">5. Derechos ARCO</h2>
          <p>
            Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales
            (derechos ARCO). Para ejercerlos, puede contactarnos a través de WhatsApp al número <strong>871 123 4567</strong>
            o enviando un correo a <strong>hola&#64;hulahoop.mx</strong>.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">6. Cambios al Aviso de Privacidad</h2>
          <p>
            Nos reservamos el derecho de modificar este aviso en cualquier momento. Cualquier cambio será publicado
            en esta página con la fecha de actualización correspondiente.
          </p>

          <h2 class="font-bubblegum text-2xl text-[#686ABB] mt-8">7. Contacto</h2>
          <p>
            Para cualquier duda respecto a este aviso de privacidad, contáctenos a través de WhatsApp:
            <strong>871 123 4567</strong>.
          </p>

        </div>
      </div>
    </div>
  `,
})
export class PrivacyPage {
  readonly year = new Date().getFullYear();
}
