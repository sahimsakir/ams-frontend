import { test, expect, type Page } from "@playwright/test";

async function workspace(page: Page, owner = false) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let enrolled = owner;
  let targetEnrolled = false;
  let subject = 1;
  let attendance: null | Record<string, unknown> = null;
  let purpose = "enroll", step = 0, session = 0;
  let retryOnce = true;
  const user = { id: 1, name: "Test Employee", email: "test@example.com", role: owner ? "owner" : "employee", active: true };
  const challenges: string[] = [];
  const steps = () => purpose === "enroll" ? ["front", "left", "right"] : ["capture"];
  const challenge = () => ({ id: `session-${session}`, step, total: steps().length, pose: steps()[step] || null, nonce: `nonce-${step}`, complete: step === steps().length, expires_at: new Date(Date.now() + 600000).toISOString() });
  await page.addInitScript(() => sessionStorage.setItem("ams_token", "test-token"));
  await page.route("**/api/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let value: unknown = {};
    if (path === "/api/me") value = { user, face_enrolled: enrolled };
    else if (path === "/api/dashboard") value = { balances: [], today: attendance, pending_reviews: 0, teams: [] };
    else if (path === "/api/face/challenges") {
      purpose = req.postDataJSON().purpose; subject = req.postDataJSON().user_id || 1; step = 0; session++;
      expect(req.postDataJSON().consent).toBe(true);
      value = challenge();
    } else if (path.endsWith("/step")) {
      const body = req.postData() || "";
      expect(body).toContain('name="frames[]"');
      expect(body).toContain('name="nonce"');
      expect(body).not.toContain('name="photo"');
      if (retryOnce) {
        retryOnce = false;
        return route.fulfill({ status: 422, json: { message: "Step not verified. Retry the current prompt." } });
      }
      challenges.push(`${purpose}:${steps()[step]}`);
      step++; value = challenge();
    } else if (path.endsWith("/capture")) {
      expect(purpose).not.toBe("enroll");
      const body = req.postData() || "";
      expect(body).toContain('name="photo"');
      expect(body).toContain('name="nonce"');
      expect(body).not.toContain('name="frames[]"');
      step = 1;
      value = challenge();
    } else if (path === "/api/face/enroll") {
      expect(step).toBe(3);
      if (subject === 1) enrolled = true; else targetEnrolled = true;
      value = { face_enrolled: true, user_id: subject, message: "Face enrolled successfully." };
    } else if (path === "/api/attendance" && req.method() === "POST") {
      expect(step).toBe(1);
      const action = req.postDataJSON().action;
      expect(action).toBe(purpose);
      attendance = { id: 1, user_id: 1, name: user.name, work_date: "2026-10-13", check_in: "2026-10-13T03:15:30.000000Z", check_out: action === "out" ? "2026-10-13T12:45:40.000000Z" : null, mode: "office" };
      value = { message: action === "in" ? "Checked in successfully" : "Checked out successfully", attendance };
    } else if (["/api/applications", "/api/attendance"].includes(path)) value = { data: attendance && path === "/api/attendance" ? [attendance] : [], current_page: 1, last_page: 1 };
    else if (path === "/api/users") value = [{ id: 2, name: "New Employee", email: "new@example.com", role: "employee", active: true, face_enrolled: targetEnrolled }];
    else if (path === "/api/audit") value = { data: [], current_page: 1, last_page: 1 };
    else value = [];
    await route.fulfill({ json: value });
  });
  await page.goto("/");
  if (owner) await expect(page.getByRole("button", { name: "People", exact: true })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Enroll your face to continue" })).toBeVisible();
  return { errors, challenges };
}

async function verifySteps(page: Page, count: number, retry = false) {
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  const button = page.getByRole("button", { name: /I’m ready — capture|Start eye check/ });
  await expect(button).toBeEnabled();
  expect(await page.locator('input[type="file"]').count()).toBe(0);
  if (retry) {
    await button.click();
    await expect(page.getByRole("alert")).toContainText("Step not verified");
    await expect(page.getByText(`STEP 1 OF ${count}`)).toBeVisible();
  }
  for (let i = 0; i < count; i++) {
    await expect(page.getByText(`STEP ${i + 1} OF ${count}`)).toBeVisible();
    await button.click();
    if (i < count - 1) await expect(page.getByText(`STEP ${i + 2} OF ${count}`)).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByRole("button", { name: "Close dialog" })).toHaveCount(0, { timeout: 20000 });
}

test("phone self-enrollment, retry, check-in and checkout show server dates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors, challenges } = await workspace(page);
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start camera", exact: true })).toBeDisabled();
  await verifySteps(page, 3, true);
  await expect(page.getByRole("button", { name: "Capture & check in" })).toBeVisible();
  await page.getByRole("button", { name: "Capture & check in" }).click();
  await singleCapture(page,"Capture & check in");
  await expect(page.locator(".clock-times")).toContainText("13 Oct 2026, 09:15:30");
  await page.getByRole("button", { name: "Capture & check out" }).click();
  await singleCapture(page,"Capture & check out");
  await expect(page.locator(".clock-times")).toContainText("13 Oct 2026, 18:45:40");
  await expect(page.getByRole("button", { name: "Workday complete" })).toBeDisabled();
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("13 Oct 2026, 09:15:30");
  await expect(page.locator("tbody")).toContainText("13 Oct 2026, 18:45:40");
  expect(challenges.filter((p) => p.startsWith("enroll:"))).toEqual(["enroll:front", "enroll:left", "enroll:right"]);
  expect(errors).toEqual([]);
});

test("camera modal fits narrow phones, tablets and desktops, and stops on close", async ({ page }) => {
  const { errors } = await workspace(page, true);
  await page.getByRole("button", { name: "People", exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Enroll face", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start camera", exact: true }).click();
    await expect(page.getByRole("button", { name: /I’m ready — capture|Start eye check/ })).toBeEnabled();
    await page.evaluate(() => { (window as any).testStream = (document.querySelector("video") as HTMLVideoElement).srcObject; });
    if (width === 390) await page.screenshot({ path: "test-results/mobile-camera.png", fullPage: true });
    await page.getByRole("button", { name: "Close dialog" }).click();
    expect(await page.evaluate(() => (window as any).testStream.getTracks().every((t: MediaStreamTrack) => t.readyState === "ended"))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("camera permission failure provides recovery instructions", async ({ page }) => {
  await workspace(page);
  await page.evaluate(() => Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) }));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Camera permission was denied");
  await expect(page.getByRole("button", { name: "Start camera", exact: true })).toBeEnabled();
});


test("owner enrolls a selected user through three steps", async ({ page }) => {
  await workspace(page, true);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Enroll face", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enroll face: New Employee" })).toBeVisible();
  await expect(page.getByText("Ask New Employee to sit in front of the camera.", { exact: false })).toBeVisible();
  await verifySteps(page, 3, true);
  await expect(page.locator("tbody")).toContainText("Enrolled");
  await expect(page.getByRole("button", { name: "Enroll face", exact: true })).toHaveCount(0);
});

async function singleCapture(page: Page, label: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button",{ name:"Start camera",exact:true }).click();
  await expect(dialog.locator(".camera-steps")).toHaveCount(0);
  await expect(dialog.getByText("Close & open eyes",{exact:true})).toHaveCount(0);
  await dialog.getByRole("button",{name:label,exact:true}).click();
  await expect(dialog).toHaveCount(0,{timeout:20000});
}
