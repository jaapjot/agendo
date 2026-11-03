# Guía de aprendizaje: Agendo

> Esta guía está escrita como si fuera tu mentor técnico. El objetivo no es que memorices el código, sino que **entiendas cada decisión** y puedas defenderla en una entrevista. No asume que ya conocés las tecnologías: cada concepto se explica la primera vez que aparece.

## Índice

1. [Cómo usar esta guía](#1-cómo-usar-esta-guía)
2. [El recorrido de una reserva, de punta a punta](#2-el-recorrido-de-una-reserva-de-punta-a-punta)
3. [La arquitectura explicada](#3-la-arquitectura-explicada)
4. [Por qué cada tecnología](#4-por-qué-cada-tecnología)
5. [Los archivos más importantes](#5-los-archivos-más-importantes)
6. [Las funciones principales, línea por línea](#6-las-funciones-principales)
7. [Conceptos de programación que estás aplicando](#7-conceptos-de-programación-que-estás-aplicando)
8. [Preguntas de entrevista (con respuestas)](#8-preguntas-de-entrevista)
9. [Ejercicios para ampliar el proyecto](#9-ejercicios)
10. [Experimentos: rompé cosas a propósito](#10-experimentos-rompé-cosas-a-propósito)

---

## 1. Cómo usar esta guía

Orden recomendado para estudiar el código (de lo más simple a lo más complejo):

1. `apps/api/prisma/schema.prisma`: el **modelo de datos**. Todo lo demás gira alrededor de esto.
2. `apps/api/src/modules/scheduling/slot-engine.ts` y su test: lógica pura, sin frameworks.
3. `apps/api/src/app.ts`: cómo se arma el servidor.
4. `apps/api/src/modules/auth/`: registro, login y tokens.
5. `apps/api/src/modules/appointments/appointments.service.ts`: las reglas de negocio.
6. `apps/web/src/lib/api.ts`: cómo el frontend habla con el backend.
7. `apps/web/src/pages/ProfessionalPage.tsx` y `components/SlotPicker.tsx`: la pantalla principal.

Consejo: **corré los tests mientras leés** (`npm test`). Cambiá una línea, mirá qué test falla y por qué. Es la forma más rápida de entender código ajeno.

---

## 2. El recorrido de una reserva, de punta a punta

Seguir una acción concreta por todo el sistema es la mejor forma de entender una aplicación full stack. Veamos qué pasa cuando Martín reserva un corte de pelo.

**1. Martín elige el servicio y un día.** El componente `SlotPicker` ejecuta:

```ts
useQuery({ queryKey: ['slots', slug, serviceId, selectedDate], queryFn: () => api.get(...) })
```

TanStack Query hace un `GET /api/professionals/estudio-demo/slots?serviceId=…&date=2026-11-05`. Si Martín vuelve a ese día, la respuesta sale de la **caché** (no se repite el pedido durante 15 segundos).

**2. El backend calcula los horarios libres.** La ruta en `professionals.routes.ts` valida el query string con Zod y llama a `getAvailableSlots()`, que:

- busca el perfil (zona horaria, reglas de anticipación),
- busca las reglas semanales ("lunes 9 a 13") y los períodos ocupados (turnos + vacaciones),
- llama a la función pura `computeAvailableSlots()`, que devuelve los inicios posibles.

**3. Martín elige las 10:00 y confirma.** El frontend hace `POST /api/appointments` con `{ professionalSlug, serviceId, startsAt: "2026-11-05T13:00:00.000Z" }`. Fijate que las 10:00 de Buenos Aires se envían como **13:00 UTC**: el servidor siempre trabaja con instantes exactos.

**4. El middleware `authenticate`** lee el header `Authorization: Bearer <token>`, verifica la firma del JWT y deja `req.user = { id, role }`. Después `requireRole('CLIENT')` verifica que sea un cliente.

**5. `bookAppointment()` aplica las reglas de negocio:**

- ¿Existe el profesional? ¿El servicio está activo?
- ¿Ese horario es uno de los que ofreceríamos? (reutiliza el mismo motor de slots)
- Si todo está bien, hace `INSERT` del turno con el **precio congelado**.

**6. PostgreSQL tiene la última palabra.** Si en el mismo milisegundo Sofía reservó el mismo horario, las dos pasaron el paso 5, pero la _exclusion constraint_ rechaza el segundo `INSERT`. Prisma lanza un error, el `errorHandler` lo reconoce y responde `409 SLOT_TAKEN`.

**7. El frontend reacciona.** Si es éxito, muestra "¡Turno confirmado!" e invalida la caché de "mis turnos". Si es 409, muestra un toast en español, deselecciona el horario e invalida la caché de slots para mostrar la disponibilidad actualizada.

Si podés contar este recorrido en una entrevista, demostrás que entendés frontend, backend, base de datos, seguridad y concurrencia **juntos**. Eso es exactamente lo que buscan en un perfil full stack.

---

## 3. La arquitectura explicada

### 3.1 Monorepo con workspaces

El repositorio tiene dos aplicaciones (`apps/api` y `apps/web`) manejadas con **npm workspaces**: un solo `npm install`, un solo `package-lock.json` y scripts que corren en ambas (`npm test`, `npm run lint`).

_¿Por qué no dos repositorios?_ Porque frontend y backend cambian juntos (si agregás un campo en la API, lo usás en el frontend). En un monorepo eso queda en un solo commit y un solo pull request.

### 3.2 Capas del backend

```
HTTP request
   ↓
Middleware      → seguridad (helmet), parseo JSON, cookies, autenticación, roles
   ↓
Routes          → "traductor": valida la entrada, llama al servicio, responde JSON
   ↓
Services        → reglas de negocio ("¿se puede cancelar?", "¿el horario está libre?")
   ↓
Prisma          → acceso a la base de datos
   ↓
PostgreSQL      → persistencia + restricciones de integridad
```

Esto se llama **separación de responsabilidades**. Cada capa tiene un solo motivo para cambiar:

- Si mañana la API pasa de REST a GraphQL, cambian las rutas, no las reglas.
- Si cambia una regla de cancelación, cambia el servicio, no las rutas.

En los módulos simples (perfil, servicios) la lógica es tan corta que vive en el archivo de rutas. Separarla sería **sobreingeniería**. Saber cuándo NO agregar capas también es criterio.

### 3.3 Mismo origen en producción

En producción, Express sirve **también** el frontend compilado (`app.ts`, bloque `if (isProduction)`). El navegador ve un solo sitio: `https://agendo.onrender.com` sirve tanto `/` como `/api/...`.

Ventajas:

- **No hace falta CORS** (el mecanismo del navegador que bloquea pedidos entre sitios distintos).
- La cookie de sesión puede ser `SameSite=Strict`: el navegador no la envía si el pedido viene de otro sitio, lo que protege contra ataques **CSRF**.
- Un solo deploy, una sola URL.

En desarrollo, Vite corre en el puerto 5173 y Express en el 4000. Para imitar "mismo origen", Vite tiene un **proxy**: todo lo que empieza con `/api` lo reenvía a Express (`vite.config.ts`).

### 3.4 Frontend

```
main.tsx          → providers: QueryClient, Router, Auth, Toaster
App.tsx           → tabla de rutas
pages/            → una pantalla por archivo
components/ui/    → "design system": piezas visuales reutilizables
components/       → componentes con lógica propia (SlotPicker, layouts)
lib/              → cliente HTTP, formato de fechas/precios, tipos
auth/             → estado de sesión y protección de rutas
```

Hay dos tipos de estado:

- **Estado del servidor** (turnos, servicios, perfil): lo maneja **TanStack Query**. Nunca se copia a `useState`.
- **Estado de la interfaz** (qué servicio está seleccionado, si un modal está abierto): `useState` local.

Mezclar las dos cosas (por ejemplo, guardar la lista de turnos en un `useState` y actualizarla a mano) es una de las fuentes de bugs más comunes en React.

---

## 4. Por qué cada tecnología

En una entrevista no alcanza con "usé X". Tenés que poder decir **por qué** y **qué alternativa descartaste**.

| Tecnología                          | Para qué                       | Por qué esta                                                                                                           | Alternativas                                                                              |
| ----------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **TypeScript**                      | Tipos en JavaScript            | Detecta errores antes de ejecutar. Si la API cambia la forma de un objeto, el compilador te marca cada lugar afectado. | JavaScript puro (más rápido de escribir, más bugs en producción)                          |
| **React**                           | Interfaz de usuario            | El estándar del mercado; componentes reutilizables                                                                     | Vue, Angular, Svelte                                                                      |
| **Vite**                            | Servidor de desarrollo y build | Arranque instantáneo, configuración mínima                                                                             | Webpack (más lento y complejo), Next.js (agrega renderizado en servidor, innecesario acá) |
| **Tailwind CSS**                    | Estilos                        | Las clases están junto al HTML; los colores y espacios salen de un sistema (tokens en `index.css`)                     | CSS Modules, styled-components                                                            |
| **TanStack Query**                  | Datos del servidor             | Caché, reintentos, estados de carga/error e invalidación, sin escribirlos a mano                                       | `useEffect` + `fetch` (mucho código repetido y propenso a errores), Redux                 |
| **React Hook Form + Zod**           | Formularios                    | Validación declarativa con esquemas tipados; pocos re-renders                                                          | Formik, validar a mano                                                                    |
| **Express 5**                       | Servidor HTTP                  | Simple, el más usado en Node; la v5 captura errores de funciones `async` sola                                          | NestJS (más estructura, más curva), Fastify                                               |
| **PostgreSQL**                      | Base de datos                  | Relacional y robusta, con _exclusion constraints_ y rangos de tiempo, clave para este problema                         | MySQL (no tiene exclusion constraints), MongoDB (sin relaciones ni esas garantías)        |
| **Prisma**                          | ORM                            | Cliente tipado generado del esquema, migraciones versionadas                                                           | TypeORM, Drizzle, SQL a mano                                                              |
| **Luxon**                           | Fechas y zonas horarias        | Maneja zonas IANA (`America/Argentina/Buenos_Aires`) explícitamente                                                    | date-fns-tz, Day.js; el `Date` nativo no maneja zonas                                     |
| **JWT + bcrypt**                    | Autenticación                  | Estándar, sin estado en el servidor para el access token                                                               | Sesiones en servidor (también válido; ver pregunta 4)                                     |
| **Vitest / Supertest / Playwright** | Tests                          | Rápido, compatible con Vite; Supertest prueba HTTP sin abrir puertos; Playwright maneja un navegador real              | Jest, Cypress                                                                             |
| **Docker**                          | Empaquetado                    | "Funciona en mi máquina" pasa a "funciona en cualquier máquina"                                                        | Instalar todo a mano en el servidor                                                       |

---

## 5. Los archivos más importantes

| Archivo                                                     | Qué hace                                    | Qué mirar                                                                         |
| ----------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                             | Define tablas, relaciones e índices         | Por qué `priceCents` es `Int`; por qué `AvailabilityRule` usa minutos y no fechas |
| `apps/api/prisma/migrations/*_init/migration.sql`           | El SQL real que crea la base                | La `EXCLUDE USING gist` al final y los `CHECK`                                    |
| `apps/api/src/config/env.ts`                                | Valida variables de entorno al arrancar     | Qué pasa si falta `JWT_ACCESS_SECRET` (probalo)                                   |
| `apps/api/src/app.ts`                                       | Arma Express: middlewares, rutas, estáticos | El orden importa: `errorHandler` va último                                        |
| `apps/api/src/middleware/error-handler.ts`                  | Convierte cualquier error en respuesta HTTP | Cómo se reconoce el error 23P01 de PostgreSQL                                     |
| `apps/api/src/middleware/authenticate.ts`                   | Verifica tokens y roles                     | `requireRole` es una función que _devuelve_ un middleware                         |
| `apps/api/src/modules/scheduling/slot-engine.ts`            | Calcula horarios libres                     | Por qué es una función pura                                                       |
| `apps/api/src/modules/auth/auth.service.ts`                 | Registro, login, rotación de tokens         | `DUMMY_PASSWORD_HASH` y la familia de tokens                                      |
| `apps/api/src/modules/appointments/appointments.service.ts` | Reservar, cancelar, reprogramar, agenda     | Las "dos líneas de defensa" en `bookAppointment`                                  |
| `apps/api/test/appointments.test.ts`                        | Tests de integración                        | El test de 10 reservas simultáneas                                                |
| `apps/web/src/lib/api.ts`                                   | Cliente HTTP del frontend                   | El refresh automático y el _single flight_                                        |
| `apps/web/src/auth/AuthContext.tsx`                         | Estado de sesión global                     | Cómo se restaura la sesión al recargar                                            |
| `apps/web/src/components/SlotPicker.tsx`                    | Selector de día y horario                   | Cómo se calculan los días en la zona del profesional                              |
| `apps/web/src/pages/ProfessionalPage.tsx`                   | Flujo de reserva                            | Cómo se maneja el error 409                                                       |
| `apps/web/src/components/ui/Field.tsx`                      | Campos de formulario accesibles             | `useId`, `aria-invalid` y `aria-describedby`                                      |

---

## 6. Las funciones principales

### 6.1 `computeAvailableSlots()` (motor de horarios)

```ts
for (const rule of rulesForDay) {
  for (
    let minute = rule.startMinute;
    minute + query.durationMinutes <= rule.endMinute;
    minute += step
  ) {
    const start = day.set({ hour: Math.floor(minute / 60), minute: minute % 60 });
    const end = start.plus({ minutes: query.durationMinutes });
    if (start < earliestStart) continue; // anticipación mínima / pasado
    const isBusy = busyIntervals.some((busy) => busy.overlaps(candidate));
    if (isBusy) continue; // choca con algo
    slots.set(start.toMillis(), start.toJSDate()); // Map = sin duplicados
  }
}
```

Paso a paso:

1. Para cada rango de trabajo del día (puede haber varios: mañana y tarde).
2. Probá cada inicio posible cada 15 minutos, **siempre que el turno completo entre** antes del cierre (`minute + duración <= fin`).
3. Descartá los que están en el pasado o dentro de la anticipación mínima.
4. Descartá los que se superponen con un período ocupado.
5. Guardalos en un `Map` indexado por milisegundos, para que dos reglas superpuestas no generen el mismo horario dos veces.

**Detalle fino:** `day.set({ hour, minute })` en lugar de `medianoche.plus({ minutes })`. En un día con cambio de horario de verano, "medianoche + 540 minutos" no da las 9:00 del reloj de pared. Hay un test específico para esto con la zona de Madrid.

**Complejidad:** O(S × B), donde S es la cantidad de inicios candidatos (como mucho 96 por día con pasos de 15 minutos) y B la cantidad de períodos ocupados del día. Con números tan chicos, recorrer todo es más simple y claro que una estructura sofisticada. Ese es un buen argumento si te preguntan por eficiencia.

### 6.2 `bookAppointment()`: dos líneas de defensa

```ts
if (!isSlotAvailable({ ...context, durationMinutes }, input.startsAt)) {
  throw conflict('SLOT_UNAVAILABLE', ...);     // 1ª línea: la aplicación
}
return prisma.appointment.create({ ... });      // 2ª línea: la base de datos (constraint)
```

¿Por qué no alcanza con la primera? Por la **condición de carrera** (_race condition_):

```
Tiempo →   Martín: verifica (libre) ──────── INSERT ✔
           Sofía:      verifica (libre) ──────────── INSERT ✘ (constraint)
```

Las dos verificaciones ocurren antes de que exista algún `INSERT`, así que ambas ven el horario libre. Solo la base de datos, que procesa los `INSERT` de forma atómica, puede garantizar que no se superpongan. El test `allows exactly one of many simultaneous bookings` lo demuestra: las 10 reservas pasan la primera línea y la base rechaza 9.

### 6.3 `refresh()`: rotación con detección de robo

1. El navegador envía la cookie con el refresh token.
2. Se busca **el hash** del token (en la base nunca se guarda el token real).
3. Si el token ya estaba revocado → alguien lo está reutilizando. Puede ser un robo, así que se revoca **toda la familia** (todos los tokens que vienen de ese login) y el usuario debe volver a ingresar.
4. Si es válido, se revoca con un `updateMany ... where revokedAt: null` (si dos pedidos llegan juntos, solo uno "gana") y se emite uno nuevo en la misma familia.

El "período de gracia" de 30 segundos existe porque dos pestañas abiertas pueden refrescar al mismo tiempo con la misma cookie. Eso no es un robo y no debería desloguear a nadie.

### 6.4 `request()` en `api.ts`: refresh automático y _single flight_

Cuando una llamada recibe 401 (token vencido):

1. Llama a `refreshSession()`.
2. Si obtiene un token nuevo, **repite la llamada original** (`retried = true` evita un bucle infinito).

Si el dashboard hace 3 pedidos a la vez y los 3 reciben 401, sin _single flight_ se lanzarían 3 refresh con la misma cookie, y el servidor interpretaría el 2º y el 3º como reutilización (¡robo!). Con `refreshInFlight ??= (...)` los 3 esperan **la misma promesa**.

### 6.5 `errorHandler`: un solo lugar para los errores

Las rutas no tienen `try/catch`: simplemente lanzan errores (`throw notFound('Service')`). Express 5 los captura y los pasa al `errorHandler`, que decide:

- `AppError` → su status y código.
- `ZodError` → 400 con el detalle por campo.
- Violación de la exclusion constraint → 409 `SLOT_TAKEN`.
- Cualquier otra cosa → se registra completa en el log, pero al cliente solo le llega "Something went wrong" (**nunca se filtran detalles internos**).

---

## 7. Conceptos de programación que estás aplicando

**API REST.** Los recursos se identifican con URLs (`/appointments/:id`) y las acciones con verbos HTTP: `GET` lee, `POST` crea, `PATCH` modifica parcialmente, `PUT` reemplaza, `DELETE` borra.

**Códigos de estado HTTP.** `200` OK · `201` creado · `204` sin contenido · `400` datos inválidos · `401` no autenticado ("¿quién sos?") · `403` sin permiso ("sé quién sos, pero no podés") · `404` no existe · `409` conflicto con el estado actual · `429` demasiados pedidos · `500` error del servidor.

**Autenticación vs. autorización.** Autenticación es verificar identidad (login, JWT). Autorización es verificar permisos (`requireRole`, "este turno es tuyo"). El guard del frontend (`RequireAuth`) es solo comodidad visual: **la seguridad real está en el servidor**.

**Hashing de contraseñas.** Una función de hash es de una sola vía: no se puede "deshashear". bcrypt además es **lento a propósito** (factor 12, unas 250 ms) y usa _salt_ (un valor aleatorio por contraseña), así que dos usuarios con la misma contraseña tienen hashes distintos y los ataques de diccionario masivos se vuelven carísimos.

**JWT (JSON Web Token).** Un JSON firmado: `header.payload.firma`. Cualquiera puede leer el payload (es Base64, no está cifrado), pero nadie puede modificarlo sin invalidar la firma. Por eso nunca va información sensible adentro.

**Integridad referencial y constraints.** Las _foreign keys_ garantizan que un turno no apunte a un servicio inexistente. Los `CHECK` garantizan reglas simples (precio ≥ 0). La _exclusion constraint_ garantiza que no haya superposiciones. La base protege los datos aunque la aplicación tenga un bug.

**Índices.** `@@index([professionalId, startsAt])` permite buscar "los turnos de este profesional entre estas fechas" sin recorrer toda la tabla. Es como el índice de un libro.

**Transacciones (ACID).** `prisma.$transaction([...])` en `PUT /availability` borra el horario viejo y crea el nuevo como **una sola operación**: o pasan las dos, o ninguna. Nunca queda un profesional sin horario a mitad de camino.

**Condición de carrera.** Un resultado que depende del orden en que se ejecutan operaciones concurrentes. Ver 6.2.

**Funciones puras.** Mismo input, mismo output, sin efectos secundarios. `computeAvailableSlots` recibe "ahora" como parámetro en lugar de leer el reloj, y por eso los tests son deterministas.

**Validación en el borde.** Todo lo que entra desde afuera (body, query, params) se valida con Zod antes de usarse. Dentro del sistema, los datos ya son confiables y están tipados.

**Migraciones.** Cambios de esquema versionados en archivos SQL dentro de git. Cualquier persona (o el servidor de producción) puede reconstruir la base exacta con `prisma migrate deploy`.

**Zonas horarias.** Se guarda UTC, se muestra en la zona del profesional. Regla de oro: **convertí en los bordes** (al recibir y al mostrar), nunca en el medio.

**Debounce.** En el buscador, se espera a que el usuario deje de tipear 300 ms antes de pedir resultados. Escribir "kinesio" genera 1 pedido en vez de 7.

**Code splitting.** El JavaScript del panel del profesional se descarga solo si alguien entra al panel (`React.lazy`). Los clientes no pagan ese peso.

**Caché e invalidación.** Después de cancelar un turno, `invalidateQueries(['my-appointments'])` marca esos datos como viejos y TanStack Query los vuelve a pedir. Mantener la caché coherente es uno de los problemas clásicos de la informática.

**Accesibilidad (a11y).** Labels asociados a inputs, `role="radiogroup"` en los selectores, `aria-live` para anunciar resultados, `<dialog>` nativo para los modales (maneja el foco y la tecla Escape). También beneficia a los tests: Playwright encuentra elementos por su rol y nombre, igual que un lector de pantalla.

**Pirámide de tests.** Muchos tests unitarios (rápidos, el motor de slots), varios de integración (API + base real), pocos end-to-end (lentos pero realistas).

---

## 8. Preguntas de entrevista

Intentá responder cada una **en voz alta** antes de leer la respuesta.

**1. Contame el proyecto en un minuto.**

> "Agendo es una aplicación full stack de turnos para profesionales independientes. El profesional configura servicios y horarios y comparte un link; el cliente reserva un horario libre. Está hecha con React y TypeScript en el frontend, Node con Express en el backend y PostgreSQL con Prisma. Lo más interesante técnicamente fue garantizar que no haya reservas superpuestas aun con pedidos simultáneos, y el manejo de zonas horarias. Tiene tests unitarios, de integración contra una base real y end-to-end, con CI en GitHub Actions."

**2. ¿Cómo evitás que dos personas reserven el mismo horario?**

> Con dos capas. La aplicación verifica la disponibilidad, pero eso tiene una condición de carrera: dos pedidos simultáneos pueden pasar la verificación. Por eso PostgreSQL tiene una exclusion constraint sobre `(professional_id, tstzrange(starts_at, ends_at))` que hace imposible insertar rangos superpuestos para el mismo profesional. El segundo `INSERT` falla, lo traduzco a un 409 y el frontend muestra horarios actualizados. Tengo un test que lanza 10 reservas simultáneas y verifica que exactamente una tenga éxito.

**3. ¿Por qué no usaste una transacción con `SELECT ... FOR UPDATE`?**

> También funcionaría: bloquear filas mientras verifico. Pero bloquear "la ausencia de filas" (un horario libre) es complicado, porque no hay fila que bloquear. Habría que bloquear el perfil del profesional y eso serializa todas sus reservas. La constraint es declarativa, no necesita locks explícitos y protege incluso si alguien inserta datos por otro camino.

**4. ¿Dónde guardás los tokens y por qué?**

> El access token, que dura 15 minutos, vive en memoria, en una variable de JavaScript. El refresh token, que dura 7 días, va en una cookie httpOnly, que JavaScript no puede leer. Así, si hay un ataque XSS, el atacante no puede robar la credencial de larga duración desde el storage. Guardar tokens en `localStorage` es cómodo pero los deja expuestos a cualquier script inyectado.

**5. ¿Qué es la rotación de refresh tokens?**

> Cada vez que se usa un refresh token, se invalida y se emite uno nuevo. Si un token ya usado vuelve a aparecer, significa que alguien tiene una copia: revoco toda la familia de tokens de esa sesión y el usuario debe volver a loguearse.

**6. ¿Por qué el login responde igual con email inexistente o contraseña incorrecta?**

> Para no revelar qué emails están registrados (_user enumeration_). Por la misma razón comparo contra un hash falso cuando el usuario no existe, así el tiempo de respuesta también es similar.

**7. ¿Cómo manejás las zonas horarias?**

> En la base guardo instantes en UTC (`timestamptz`). Los horarios de trabajo los guardo como "minutos desde la medianoche local", porque "los lunes de 9 a 13" es una regla de reloj de pared, no un instante. Los slots se generan en la zona del profesional con Luxon y se convierten a UTC. El frontend muestra todo en la zona del profesional, no en la del navegador. Hay un test con el cambio de horario de verano de Madrid.

**8. ¿Por qué el precio se copia en el turno?**

> Es un _snapshot_ histórico. Si el profesional sube el precio mañana, los turnos ya reservados deben mantener el precio acordado. Es el mismo principio por el que una factura guarda el precio del producto y no una referencia a él.

**9. ¿Por qué guardás el dinero en centavos (enteros)?**

> Porque los números de punto flotante no representan exactamente valores decimales (`0.1 + 0.2 !== 0.3` en JavaScript). Con enteros no hay errores de redondeo.

**10. ¿Qué devolvés cuando alguien pide un recurso de otro usuario: 403 o 404?**

> 404. Si devolviera 403, confirmaría que ese id existe, lo cual es información. Con 404, desde afuera no se puede distinguir "no existe" de "no es tuyo".

**11. ¿Cómo testeaste la API?**

> Tres niveles. Unitarios para el motor de slots, que es una función pura. Integración con Supertest contra un PostgreSQL real, porque hay reglas como la exclusion constraint que solo existen en la base y un mock no las probaría. Y end-to-end con Playwright, que maneja un navegador real en escritorio y celular. Todo corre en CI.

**12. ¿Qué es `createApp()` y por qué está separado de `server.ts`?**

> `createApp()` construye la aplicación Express sin abrir un puerto. Los tests la importan y Supertest le hace pedidos en memoria. `server.ts` es solo el punto de entrada que llama a `listen` y maneja el apagado ordenado.

**13. ¿Qué harías si la app tuviera 100 veces más usuarios?**

> Primero mediría. Algunos cambios probables: mover el rate limiting a Redis (hoy vive en memoria y no se comparte entre instancias), agregar un pool de conexiones o PgBouncer, cachear la página pública del profesional, y procesar notificaciones en una cola en lugar de dentro del request. Los índices ya cubren las consultas principales.

**14. ¿Qué mejorarías si tuvieras más tiempo?**

> Notificaciones por email, recuperación de contraseña, limpieza periódica de refresh tokens vencidos, y un intervalo de descanso configurable entre turnos.

**15. ¿Por qué TanStack Query y no `useEffect` con `fetch`?**

> Con `useEffect` tendría que manejar a mano los estados de carga y error, cancelar pedidos viejos, cachear y saber cuándo volver a pedir. TanStack Query resuelve todo eso y además deduplica pedidos iguales. Además separa claramente el estado del servidor del estado de la interfaz.

**16. ¿Usaste IA para construir el proyecto?**

> Respondé con honestidad. Por ejemplo: _"Sí, lo desarrollé con un asistente de IA, y mi foco fue entender y poder defender cada decisión. Después le agregué funcionalidades por mi cuenta: [nombrá los ejercicios que hiciste]."_ Los entrevistadores valoran la transparencia, y la prueba real es que puedas explicar el código, que es para lo que existe esta guía.

---

## 9. Ejercicios

Ordenados de menor a mayor dificultad. Hacé cada uno en una rama propia (`git switch -c ejercicio-1`) y con sus tests. **Estos commits son tuyos y le dan valor real a tu historial de GitHub.**

### Nivel 1: para familiarizarte

1. **Teléfono del cliente.** Agregá un campo opcional `phone` al usuario. Pasos: `schema.prisma` → `npm run db:migrate` → esquema Zod de registro → formulario de registro → mostrarlo en la agenda del profesional.
   _Pista:_ buscá todos los lugares donde aparece `name:` en el registro y seguí el mismo camino.

2. **Contador en el dashboard.** Agregá a `/api/me/summary` la cantidad de clientes distintos atendidos en los últimos 30 días y mostralo en una cuarta tarjeta.
   _Pista:_ `prisma.appointment.findMany({ distinct: ['clientId'], ... })` o `groupBy`.

3. **Duración en el resumen de reserva.** En la tarjeta "Tu reserva", mostrá también la hora de finalización ("10:00 a 10:45").

### Nivel 2: lógica de negocio

4. **Intervalo entre turnos.** Agregá al servicio un campo `bufferMinutes` (tiempo de limpieza o preparación después del turno). El motor de slots debe tratarlo como tiempo ocupado.
   _Pista:_ modificá `computeAvailableSlots` y **escribí primero el test** que falla (TDD).

5. **Límite de turnos por día.** Que el profesional pueda configurar un máximo de turnos diarios. Cuando se alcanza, ese día no muestra más horarios.

6. **Filtro en la agenda.** Agregá un filtro por estado (confirmados, asistidos, cancelados) en la agenda del profesional, guardado en la URL (`?estado=...`), como hace el buscador.

### Nivel 3: arquitectura

7. **Cambio de contraseña.** Endpoint `POST /api/auth/change-password` que pida la contraseña actual y revoque todos los demás refresh tokens del usuario. Pensá: ¿por qué conviene revocarlos?

8. **Limpieza de tokens.** Escribí un script (`npm run db:cleanup`) que borre los refresh tokens vencidos o revocados hace más de 30 días. ¿Cómo lo ejecutarías periódicamente en producción?

9. **Exportar a calendario.** Endpoint que devuelva los turnos del cliente en formato iCalendar (`.ics`) para importarlos en Google Calendar.

10. **Notificaciones por email.** Al reservar o cancelar, enviar un email. Empezá con un "proveedor de prueba" que solo escriba en el log, detrás de una interfaz (`interface Mailer { send(...) }`), y después conectá uno real. Ese patrón se llama **inversión de dependencias**.

---

## 10. Experimentos: rompé cosas a propósito

Romper el código a propósito es la forma más rápida de entender por qué está escrito así.

- **Borrá la exclusion constraint** (creá una migración con `ALTER TABLE appointments DROP CONSTRAINT appointments_no_overlap;`) y corré `npm test`. ¿Qué test falla y con qué números? Después restaurala.
- **Cambiá `day.set({ hour, minute })` por `day.plus({ minutes: minute })`** en el motor de slots y corré los tests. ¿Cuál falla y por qué?
- **Sacá `requireRole('CLIENT')`** de la ruta de reservas y corré los tests. ¿Qué agujero de seguridad aparece?
- **Quitá el `??=` del single flight** en `api.ts`, poné el access token en 1 minuto (`ACCESS_TOKEN_TTL_MINUTES=1`) y abrí el dashboard después de 2 minutos con la pestaña Network abierta. ¿Cuántos refresh ves?
- **Arrancá la API sin `JWT_ACCESS_SECRET`.** Mirá el mensaje de error. ¿Por qué es mejor fallar al arrancar que en el primer login?

Si después de esta guía podés explicar el recorrido de la sección 2, responder las preguntas de la sección 8 sin mirar y completar al menos dos ejercicios, este proyecto es tuyo de verdad.
