
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- ALWAYS use external template files (`.html`), NEVER inline templates in the TS file
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
- Do not write arrow functions in templates (they are not supported).

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

---

## 🚨 Arquitectura Crítica: Aplicación Zoneless + Locale es-MX

**Este proyecto NO usa Zone.js. Corre en modo Zoneless con `provideZonelessChangeDetection()`.**

### Reglas de Change Detection (NUNCA violar)

1. **NO uses `NgZone` ni `ngZone.run()`** — Zone.js no está presente. Inyectarlo o llamarlo no tiene efecto y genera confusión.
2. **NO uses `ChangeDetectorRef.detectChanges()` como parche** — Si el CD no corre, hay un error en la plantilla o un fallo de configuración global. Resuelve la causa raíz.
3. **NO uses `async ngOnInit()`** — El patrón correcto para carga de datos es `constructor()` + método `private async loadXxx()`. Las páginas que usan `ngOnInit` para cargas async fallan silenciosamente en modo Zoneless.

**Patrón correcto para todos los componentes de lista/admin:**
```typescript
export class AdminXxx {
  // ✅ Sin NgZone, sin ChangeDetectorRef
  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const data = await this.service.getAll();
    this.items.set(data);      // signal.set() directo — funciona en Zoneless
    this.loading.set(false);
  }
}
```

### Reglas de Locale y Pipes de Moneda (NUNCA violar)

4. **NO pases `'es-MX'` como 4to parámetro en pipes de moneda** — El locale ya está configurado globalmente en `app.config.ts` con `LOCALE_ID = 'es-MX'` y `registerLocaleData(localeEsMx)`. Pasarlo explícitamente es redundante; si el locale no estuviera registrado causaría `NG0700` que aborta el ciclo de CD completo.

```html
<!-- ❌ MAL — parámetro redundante y potencialmente peligroso -->
{{ monto | currency:'MXN':'symbol-narrow':'1.0-0':'es-MX' }}

<!-- ✅ BIEN — el LOCALE_ID global ya aplica es-MX -->
{{ monto | currency:'MXN':'symbol-narrow':'1.0-0' }}
```

5. **NO registres locales adicionales sin añadirlos a `app.config.ts`** — El registro debe estar en el archivo de configuración principal para que aplique tanto en cliente (browser) como en servidor (SSR).

### Por qué las páginas de Catálogos (PrimeNG) funcionaban y las otras no

Las páginas de catálogo usan componentes PrimeNG que internamente disparan eventos del DOM con bindings de Angular, lo que accidentalmente forzaba un ciclo de CD. Las páginas con HTML/Tailwind puro dependían únicamente de los signals — y en Zoneless el error `NG0700` del pipe de moneda abortaba ese ciclo antes de pintar la lista.
