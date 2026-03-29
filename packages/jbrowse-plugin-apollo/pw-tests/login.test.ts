import { expect, test } from '@playwright/test'

import { loginAsRoot, resetDatabase, setupBrowserLogging } from './helpers.js'

test.describe('Login workflow', () => {
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('shows login dialog for unauthenticated user and allows root login', async ({
    page,
  }) => {
    setupBrowserLogging(page)

    // Navigate WITHOUT setting auth cookie — user is unauthenticated
    await page.goto('/jbrowse/')

    // The login dialog should appear automatically
    const loginDialog = page.getByTestId('login-dialog')
    await expect(loginDialog).toBeVisible({ timeout: 20_000 })
    console.log('[test] Login dialog appeared')

    // The root password field should be available
    const passwordField = loginDialog.getByLabel('Root password')
    await expect(passwordField).toBeVisible({ timeout: 10_000 })
    console.log('[test] Root password field visible')

    // Fill in password and submit
    await passwordField.fill('password')
    await loginDialog.getByRole('button', { name: 'Sign in as Root' }).click()

    // After reload, the login dialog should be gone and Apollo menu should
    // be enabled (indicating authenticated session loaded)
    await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
      timeout: 20_000,
    })
    console.log('[test] Apollo button ready after root login')

    // Verify the login dialog is no longer visible
    await expect(loginDialog).not.toBeVisible()
    console.log('[test] Login dialog dismissed')
  })

  test('logout redirects to server and clears auth', async ({ page }) => {
    // Start authenticated
    await loginAsRoot(page)

    // Open Apollo > Log out
    await page.getByRole('button', { name: 'Apollo' }).click()
    await expect(
      page.locator('[role="menuitem"]').filter({ hasText: 'Log out' }),
    ).toBeVisible({ timeout: 10_000 })
    await page
      .locator('[role="menuitem"]')
      .filter({ hasText: 'Log out' })
      .click()

    // Log out dialog should appear
    const logoutDialog = page.getByTestId('log-out')
    await expect(logoutDialog).toBeVisible({ timeout: 5_000 })
    console.log('[test] Logout dialog visible')

    // Clicking "Log Out" should redirect to the server's /auth/logout endpoint
    // which clears the cookie and redirects to /
    const [response] = await Promise.all([
      page.waitForNavigation(),
      logoutDialog.getByRole('button', { name: 'Log Out' }).click(),
    ])
    console.log('[test] Navigated after logout, url=' + page.url())

    // After logout, navigating back to /jbrowse/ should show the login dialog
    await page.goto('/jbrowse/')
    const loginDialog = page.getByTestId('login-dialog')
    await expect(loginDialog).toBeVisible({ timeout: 20_000 })
    console.log('[test] Login dialog shown after logout — auth was cleared')
  })
})
