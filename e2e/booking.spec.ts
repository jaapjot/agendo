import { expect, test, type Page } from '@playwright/test';

/** Unique per run so tests never collide with existing data. */
const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function registerProfessional(page: Page, id: string) {
  await page.goto('/registro?rol=profesional');
  await page.getByLabel('Tu nombre').fill('Camila Ruiz');
  await page.getByLabel('Nombre de tu negocio o marca').fill(`Kinesiología ${id}`);
  await page.getByLabel('Email').fill(`pro-${id}@example.com`);
  await page.getByLabel('Contraseña').fill('clave1234');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function setUpAgenda(page: Page) {
  // On small screens the sidebar becomes a horizontal menu; links are the same.
  await page.getByRole('link', { name: 'Servicios' }).click();
  await page.getByRole('button', { name: 'Nuevo servicio' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Sesión de kinesiología');
  await dialog.getByLabel('Duración (minutos)').fill('45');
  await dialog.getByLabel('Precio (ARS)').fill('22000');
  await dialog.getByRole('button', { name: 'Crear servicio' }).click();
  await expect(page.getByText('Servicio creado')).toBeVisible();

  await page.getByRole('link', { name: 'Horarios' }).click();
  for (const day of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']) {
    await page.getByLabel(day, { exact: true }).check();
  }
  await page.getByRole('button', { name: 'Guardar horarios' }).click();
  await expect(page.getByText('Horarios guardados')).toBeVisible();
}

test('a professional sets up their agenda and a client books, reschedules and cancels', async ({
  browser,
}, testInfo) => {
  const id = `${runId}${testInfo.project.name}`;
  const proPage = await (await browser.newContext()).newPage();
  await registerProfessional(proPage, id);
  await expect(proPage.getByText('Completá tu perfil')).toBeVisible();
  await setUpAgenda(proPage);

  // A brand-new client finds the professional, is asked to log in, signs up and returns.
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/explorar?q=${id}`);
  await page.getByRole('link', { name: new RegExp(id) }).click();
  await page.getByRole('link', { name: 'Ingresá para reservar' }).click();
  await page.getByRole('link', { name: 'Registrate' }).click();
  await page.getByLabel('Tu nombre').fill('Julián Gómez');
  await page.getByLabel('Email').fill(`client-${id}@example.com`);
  await page.getByLabel('Contraseña').fill('clave1234');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/p\//);

  await page.getByRole('radio', { name: /Sesión de kinesiología/ }).click();
  await page.getByRole('radiogroup', { name: 'Elegí un día' }).getByRole('radio').nth(1).click();
  await page
    .getByRole('radiogroup', { name: /Horarios de la/ })
    .first()
    .getByRole('radio')
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirmar turno' }).click();
  await expect(page.getByRole('heading', { name: '¡Turno confirmado!' })).toBeVisible();

  await page.getByRole('link', { name: 'Ver mis turnos' }).click();
  await page.getByRole('button', { name: 'Reprogramar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radiogroup', { name: 'Elegí un día' }).getByRole('radio').nth(2).click();
  await dialog
    .getByRole('radiogroup', { name: /Horarios de la/ })
    .first()
    .getByRole('radio')
    .first()
    .click();
  await dialog.getByRole('button', { name: 'Confirmar nuevo horario' }).click();
  await expect(page.getByText('Turno reprogramado')).toBeVisible();

  // The session survives a full reload thanks to the httpOnly refresh cookie.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis turnos' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByText('No tenés turnos próximos')).toBeVisible();
});

test('form validation and auth errors are shown to the user', async ({ page }) => {
  await page.goto('/registro');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ingresá tu nombre')).toBeVisible();
  await expect(page.getByText('Ingresá un email válido')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(`nobody-${runId}@example.com`);
  await page.getByLabel('Contraseña').fill('wrong-password1');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
});

test('protected pages redirect to login and unknown profiles show a friendly 404', async ({
  page,
}) => {
  await page.goto('/mis-turnos');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto(`/p/does-not-exist-${runId}`);
  await expect(page.getByText('No encontramos este profesional')).toBeVisible();
});
