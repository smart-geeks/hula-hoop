# Guía Técnica de Angular 21+: Resolución de Bloqueos de Change Detection por Locales en Aplicaciones Zoneless

Esta guía documenta la solución técnica definitiva implementada para resolver el error de renderizado "por partes" o congelado en el panel de administración de **Hula-Hoop**. Puedes compartir este documento directamente con otros asistentes de IA (como Claude) para que entiendan la arquitectura del proyecto y no vuelvan a introducir este error.

---

## 1. El Síntoma
En un proyecto Angular 21 con componentes standalone, reactividad basada en **Signals**, estrategia **`OnPush`** y **Client Hydration (SSR)** activo, las tablas del panel de administración (Gastos, Contratos, Compras, etc.) cargadas mediante llamadas asíncronas con promesas nativas a Supabase presentaban este fallo:
1. **Carga inicial:** El skeleton desaparecía, el contador del header se actualizaba correctamente (ej. `"4 gastos"`), pero el contenedor de la tabla se quedaba **completamente en blanco**.
2. **Primer clic en la interfaz (ej. menú flotante):** Aparecía la estructura estática de la tabla (cabeceras, bordes, iconos de editar/eliminar), pero el contenido de las filas seguía vacío.
3. **Sucesivos clics:** Los datos de texto iban apareciendo fila por fila en cada clic, pero la columna del **MONTO** y el **Total** de la cabecera se quedaban **permanentemente vacíos**.

---

## 2. La Causa Raíz: Una Reacción en Cadena Silenciosa

El error se debió a un choque destructivo entre tres tecnologías modernas en tu configuración:

### A. La Ausencia de Zone.js (Modo Zoneless)
El proyecto carece por completo de `zone.js` en su `package.json` y en `main.ts`. Esto significa que corre en modo **Zoneless**. 
En este modo, cuando un Signal se actualiza dentro de un callback asíncrono (como las promesas nativas de Supabase en un entorno `"target": "ES2022"`), Angular marca el componente como "dirty", pero **nadie le avisa que debe agendar un ciclo de Change Detection**. El renderizado se congela en el estado del servidor (los skeletons) hasta que un evento de plantilla con binding (como un `(click)="..."`) fuerza un ciclo síncrono.

### B. El Choque con Hydration (SSR)
Con `provideClientHydration(withEventReplay())` habilitado, Angular intenta reconciliar el DOM generado por el servidor (skeletons) con el del cliente. Al no haber detección de cambios automática por la falta de Zone, la hidratación se queda a medio camino y en un estado inestable.

### C. El Detonante: Uso de `'es-MX'` en Pipes sin Registrar
Este fue el **error fatal**. En las plantillas HTML se formatean las monedas así:
```html
{{ expense.monto | currency:'MXN':'symbol-narrow':'1.0-0':'es-MX' }}
```
* **Comportamiento por defecto de Angular:** Por razones de rendimiento y peso, Angular **solo incluye y reconoce los datos de idioma de `en-US`** por defecto.
* **El Bloqueo:** Cuando un pipe intenta procesar un locale no registrado como `'es-MX'`, Angular lanza un error en la consola:
  `RuntimeError: NG0700: Missing locale data for the locale "es-MX".`
* **Interrupción del Change Detection:** Al lanzarse este error en la plantilla (primero en el Total del header y luego en las filas de la tabla), **Angular cancela y aborta inmediatamente todo el ciclo de Change Detection** en curso para evitar corromper el DOM.
* **Por qué cargaba "por partes":** 
  * En el primer renderizado, el error del Total abortó todo, dejando la tabla en blanco.
  * Con clics sucesivos, Angular intentaba recuperar el renderizado pintando las partes que no usaban el pipe de moneda (botones estáticos, textos de descripción y fechas), pero las celdas de **MONTO** y **Total** jamás podían pintarse ya que el pipe seguía crasheando sistemáticamente por la falta del locale.

---

## 3. La Solución Definitiva Implementada

### Paso 1: Activar el Planificador Zoneless Estable
Registramos el proveedor nativo de Angular en `src/app/app.config.ts` para que cualquier cambio de Signal agende automáticamente una microtarea para pintar la interfaz:
```typescript
import { provideZonelessChangeDetection } from '@angular/core';

// En el array de providers:
provideZonelessChangeDetection()
```

### Paso 2: Registrar el Locale `'es-MX'` e Inyectarlo como Predeterminado
Para resolver los errores `NG0700` de forma global, importamos y registramos los datos de idioma de México en `src/app/app.config.ts`, y configuramos el token `LOCALE_ID`. Esto hace que el servidor (SSR) y el cliente (Navegador) reconozcan el formato mexicano de inmediato y que **todos los pipes de moneda y fecha utilicen español de México por defecto**:

```typescript
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';

// Registrar el idioma para que esté disponible en toda la App (Cliente y Servidor)
registerLocaleData(localeEsMx, 'es-MX');

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-MX' }, // Hace que es-MX sea el predeterminado global
    provideZonelessChangeDetection(),
    // ... resto de proveedores
  ]
};
```

---

## 4. Instrucciones de Buenas Prácticas para Claude (y otros Asistentes)

Si vas a trabajar en este proyecto con Claude u otra IA, pídele que respete estrictamente estas reglas:

> [!WARNING]
> ### 🛑 Prácticas a Evitar (Anti-patrones)
> 1. **NUNCA utilices un locale personalizado en pipes sin confirmar su registro global:** Pasar `'es-MX'` (o cualquier otro) directamente en plantillas HTML (`| currency:...:'es-MX'`) sin haber registrado previamente el locale mediante `registerLocaleData` crasheará el motor de renderizado de Angular.
> 2. **NO asumas que Zone.js está presente:** No utilices `ngZone.run()` ni esperes que las promesas nativas gatillen la detección de cambios de forma mágica. El proyecto es **Zoneless**; la reactividad y actualización de vistas se basa en **Signals** y en el planificador zoneless configurado en `app.config.ts`.
> 3. **NO uses parches locales de Change Detection:** Evita inyectar `ChangeDetectorRef` y llamar manualmente a `detectChanges()` tras las llamadas asíncronas de Supabase en los controladores. Si el Change Detection no corre, es porque hay un error no controlado en la plantilla (como el pipe roto) o una falla de configuración global. Resuelve el problema raíz, no uses parches.

> [!TIP]
> ### 🌟 Buenas Prácticas a Seguir
> 1. **Aprovecha el valor por defecto de LOCALE_ID:** Como ya configuramos `LOCALE_ID` con valor `'es-MX'`, ya no necesitas pasar el cuarto parámetro `'es-MX'` en tus plantillas. Mantén tu código limpio y seguro:
>    ```html
>    <!-- Antes -->
>    {{ expense.monto | currency:'MXN':'symbol-narrow':'1.0-0':'es-MX' }}
>
>    <!-- Ahora (Limpio, seguro y predeterminado a pesos mexicanos) -->
>    {{ expense.monto | currency:'MXN':'symbol-narrow':'1.0-0' }}
>    ```
> 2. **Mantén el bootstrapping unificado:** Asegúrate de que cualquier configuración global o polyfill se defina en `app.config.ts` para que se aplique simétricamente tanto en el navegador del cliente como en el servidor SSR.
