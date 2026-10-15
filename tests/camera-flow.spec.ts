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
  const user = { id: 1, name: "Test Employee", email: "test@example.com", role: owner ? "owner" : "employee", active: true, effective_permissions: ["dashboard.view","attendance.view","attendance.check_in","attendance.check_out","applications.view","applications.create_leave","applications.create_home_office","applications.create_overtime","teams.view","leave_types.view","calendar.view","face.enroll_self","profile.view_self","profile.change_password"] };
  const challenges: string[] = [];
  const steps = () => purpose === "enroll" ? ["front", "left", "right"] : ["capture"];
  const challenge = () => ({ id: `session-${session}`, step, total: steps().length, pose: steps()[step] || null, nonce: `nonce-${step}`, complete: step === steps().length, expires_at: new Date(Date.now() + 600000).toISOString() });
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
      expect(body.match(/name="frames\[\]"/g)).toHaveLength(4);
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
    else if(path === "/api/attendance/people") value=[{id:1,name:"Test Employee"},{id:2,name:"New Employee"}];
    else if (path === "/api/users") value = [{ id: 2, name: "New Employee", email: "new@example.com", role: "employee", active: true, face_enrolled: targetEnrolled }];
    else if (path === "/api/team-home-office") value = {data:[],teams:[]};
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


test("enrollment does not submit duplicated frames from a stalled camera", async ({ page }) => {
  await workspace(page);
  let submissions = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname.endsWith("/step")) submissions++; });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  const capture = page.getByRole("button", { name: "I’m ready — capture", exact: true });
  await expect(capture).toBeEnabled();
  await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const still = canvas.toDataURL("image/jpeg", .85);
    HTMLCanvasElement.prototype.toDataURL = () => still;
  });
  await capture.click();
  await expect(page.getByRole("alert")).toContainText("Camera frames are not updating");
  expect(submissions).toBe(0);
  await expect(capture).toBeEnabled();
});

test("responsive leave and overtime forms submit multipart documents without Slack", async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await workspace(page,true);
 await page.route("**/api/leave-types",r=>r.fulfill({json:[{id:1,name:"Casual leave",annual_limit:10}]}));
 await page.reload();
 await page.getByRole("button",{name:/Apply for leave/}).click();
 const dialog=page.getByRole("dialog");
 await expect(dialog.getByText("Type of leave",{exact:false})).toBeVisible();
 await expect(dialog.getByText(/Slack/)).toHaveCount(0);
 await dialog.getByRole("radio").check();
 await dialog.getByLabel("First day").fill("2026-10-18");
 await dialog.getByLabel("Last day").fill("2026-10-19");
 await expect(dialog.getByText("2 working day(s) selected")).toBeVisible();
 await dialog.getByLabel("Reason",{exact:true}).fill("Personal appointment");
 const sent=page.waitForRequest(r=>r.url().endsWith('/api/applications')&&r.method()==='POST');
 await dialog.getByRole("button",{name:/Submit Leave request/i}).click();
 expect((await sent).postData()).toContain('name="leave_type_id"');
 await expect(dialog).toHaveCount(0);
 await page.getByRole("button",{name:/Record overtime/}).click();
 await page.getByLabel("First day").fill("2026-10-18");
 await page.getByLabel("Last day").fill("2026-10-20");
 await page.getByLabel("Total overtime minutes",{exact:false}).fill("180");
 await page.getByLabel("Reason",{exact:true}).fill("Approved release support");
 await page.locator('.upload-dropzone').evaluate(el=>{const dt=new DataTransfer();dt.items.add(new File(['test'],'approval.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));});
 await expect(page.locator('.upload-selected')).toContainText('approval.png');
 await page.getByRole('button',{name:'Remove document'}).click();
 await expect(page.locator('.upload-selected')).toHaveCount(0);
 await page.getByLabel("Approval document (required)").setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('test')});
 await expect(page.getByRole('alert')).toContainText('Choose a JPG, PNG or PDF');
 await page.getByLabel("Approval document (required)").setInputFiles({name:'approval.png',mimeType:'image/png',buffer:Buffer.from('test')});
 const overtime=page.waitForRequest(r=>r.url().endsWith('/api/applications')&&r.method()==='POST');
 await page.getByRole('button',{name:/Submit Overtime request/i}).click();
 const body=(await overtime).postData()||'';
 expect(body).toContain('name="document"'); expect(body).toContain('2026-10-20');
});

test('monthly attendance filters, summary cards and owner work slots', async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await workspace(page,true);
 const queries:string[]=[];
 await page.route('**/api/attendance?**',async r=>{
  queries.push(r.request().url());
  await r.fulfill({json:{data:[{id:1,user_id:2,name:'New Employee',work_date:'2026-10-13',check_in:'2026-10-13T03:00:00Z',check_out:null,mode:'office',status:'missing_exit',slot_start:'09:00',slot_end:'18:00'},{id:'leave-2',user_id:2,name:'New Employee',work_date:'2026-10-12',check_in:null,check_out:null,mode:'leave',status:'leave',leave_name:'Casual',slot_start:'09:00',slot_end:'18:00'}],current_page:1,last_page:1,summary:{working_days:10,late_days:1,leave_days:1,home_office_days:0,missing_exits:1,avg_working_minutes:549,actual_avg_minutes:539,early_arrival_avg_minutes:2,late_departure_avg_minutes:7,early_arrival_days:7,late_departure_days:9,late_percent:10,leave_percent:10,home_office_percent:0}}});
 });
 await page.reload();
 await page.getByRole('button',{name:'Attendance',exact:true}).click();
 await expect(page.getByText('9h 9m',{exact:true})).toBeVisible();
 await expect(page.getByText('8h 59m',{exact:true})).toBeVisible();
 await expect(page.locator('tbody')).toContainText('Missing exit');
 await expect(page.locator('tbody')).toContainText('Casual');
 await page.getByLabel('Start date',{exact:true}).fill('2026-10-01');
 await page.getByLabel('End date',{exact:true}).fill('2026-10-14');
 await page.getByLabel('Employee',{exact:true}).selectOption('2');
 await expect.poll(()=>queries.some(u=>u.includes('start_date=2026-10-01')&&u.includes('end_date=2026-10-14')&&u.includes('user_id=2'))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByRole('button',{name:'Work slot',exact:true}).click();
 await page.getByLabel('Slot start',{exact:true}).fill('10:00');
 await page.getByLabel('Slot end',{exact:true}).fill('19:00');
 const slot=page.waitForRequest(r=>r.url().endsWith('/api/work-slots/users/2')&&r.method()==='PUT');
 await page.getByRole('button',{name:'Save work slot'}).click();
 expect((await slot).postDataJSON()).toMatchObject({slot_start:'10:00',slot_end:'19:00'});
});

test('owner creates custom role and assigns direct user permissions',async({page})=>{
 await workspace(page,true);
 const permissions=[{id:1,slug:'users.view',name:'View people',system:true},{id:2,slug:'calendar.manage',name:'Manage calendar',system:true}];
 const roles=[{id:1,name:'Owner',slug:'owner',system:true,permissions},{id:5,name:'Members',slug:'employee',system:true,permissions:[]},{id:6,name:'People Reader',slug:'people_reader',system:false,permissions:[permissions[0]]}];
 await page.route('**/api/roles',r=>r.fulfill({json:roles}));
 await page.route('**/api/permissions',r=>r.fulfill({json:permissions}));
 await page.route('**/api/users',r=>r.fulfill({json:[{id:2,name:'New Employee',email:'new@example.com',role:'employee',role_id:5,role_name:'Members',active:true,direct_permission_ids:[]}]}));
 await page.reload();
 await page.getByRole('button',{name:'Roles',exact:true}).click();
 await expect(page.getByRole('heading',{name:'People Reader',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create permission',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Create role',exact:true}).click();
 await page.getByLabel('Display name').fill('Calendar Editor');
 await page.getByLabel('Permission or role key').fill('calendar_editor');
 await page.getByRole('checkbox',{name:/Manage calendar/}).check();
 const create=page.waitForRequest(r=>r.url().endsWith('/api/roles')&&r.method()==='POST');
 await page.getByRole('button',{name:'Save role',exact:true}).click();
 expect((await create).postDataJSON()).toMatchObject({name:'Calendar Editor',slug:'calendar_editor',permission_ids:[2]});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByRole('button',{name:'Role & permissions',exact:true}).click();
 await page.getByLabel('Assigned role',{exact:true}).selectOption('6');
 await page.getByRole('checkbox',{name:/Manage calendar/}).check();
 const assign=page.waitForRequest(r=>r.url().endsWith('/api/users/2/access')&&r.method()==='PUT');
 await page.getByRole('button',{name:'Save user access'}).click();
 expect((await assign).postDataJSON()).toEqual({role_id:6,permission_ids:[2]});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Permissions',exact:true}).click();
 await expect(page.getByRole('button',{name:'Create permission',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create role',exact:true})).toHaveCount(0);
 await expect(page.getByText('View people',{exact:true})).toBeVisible();
});

test('custom read-only role only sees granted features and cannot punch',async({page})=>{
 await workspace(page,true);
 await page.route('**/api/me',r=>r.fulfill({json:{user:{id:1,name:'Reader',email:'reader@example.com',role:'reader',role_id:6,role_name:'Reader',effective_permissions:['attendance.view'],active:true},face_enrolled:true}}));
 await page.reload();
 await expect(page.getByRole('button',{name:'Attendance',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'People',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Requests',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Roles',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Attendance',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check in',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Check out',exact:true})).toBeDisabled();
});

test('permission table filters and sorting; requests only on correct pages',async({page})=>{
 await page.setViewportSize({width:390,height:844});await workspace(page,true);
 await page.route('**/api/permissions',r=>r.fulfill({json:[{id:1,name:'zeta.view',display_name:'Zeta view',slug:'zeta.view',system:true},{id:2,name:'alpha.view',display_name:'Alpha view',slug:'alpha.view',system:false}]}));
 await page.reload();await expect(page.getByRole('button',{name:'New request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Permissions',exact:true}).click();
 await expect(page.getByRole('button',{name:'New request',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Filter and sort Permission',exact:true}).click();
 await page.getByRole('button',{name:'Sort ascending',exact:true}).click();
 await expect(page.locator('tbody tr').first()).toContainText('Alpha view');
 await page.getByRole('button',{name:'Filter and sort Type',exact:true}).click();
 await page.getByLabel('Select all',{exact:true}).uncheck();await page.getByRole('checkbox',{name:'Custom',exact:true}).check();
 await page.getByRole('button',{name:'Apply filter',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText('Alpha view');
 await page.getByRole('button',{name:'Clear filters & sorting',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Requests',exact:true}).click();await expect(page.getByRole('button',{name:'New request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'People',exact:true}).click();await expect(page.getByRole('button',{name:'New request',exact:true})).toHaveCount(0);
});

test('owner assigns one team or all teams home office by date range',async({page})=>{
 await workspace(page,true);
 await page.route('**/api/team-home-office',r=>r.fulfill({json:{data:[],teams:[{id:4,name:'Engineering'}]}}));
 await page.reload();await page.getByRole('button',{name:'Team home office',exact:true}).click();
 await page.getByRole('button',{name:'Assign home office',exact:true}).click();
 await page.getByLabel('Team',{exact:true}).selectOption('4');
 await page.getByLabel('First day',{exact:true}).fill('2026-10-20');await page.getByLabel('Last day',{exact:true}).fill('2026-10-25');
 await page.getByLabel('Reason',{exact:true}).fill('Office maintenance');
 const submitted=page.waitForRequest(r=>r.url().endsWith('/api/team-home-office')&&r.method()==='POST');
 await page.getByRole('button',{name:'Save home-office assignment',exact:true}).click();
 expect((await submitted).postDataJSON()).toMatchObject({team_id:4,start_date:'2026-10-20',end_date:'2026-10-25'});
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('attendance photo buttons preview both captures and respect row permissions', async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await workspace(page,true);
 let allowed=true;
 await page.route('**/api/attendance?**',r=>r.fulfill({json:{data:[{id:7,user_id:2,name:'Team Member',work_date:'2026-10-14',check_in:'2026-10-14T03:00:00Z',check_out:'2026-10-14T12:00:00Z',mode:'office',can_view_photo:allowed,has_in_photo:true,has_out_photo:true}],current_page:1,last_page:1,summary:{}}}));
 await page.route('**/api/attendance/7/photo/*',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFncAAAAASUVORK5CYII=','base64')}));
 await page.reload();
 await page.getByRole('button',{name:'Attendance',exact:true}).click();
 for(const side of ['Check-in','Check-out']){
  await page.locator('tbody tr').first().click();
  await page.getByRole('button',{name:side+' photo',exact:true}).click();
  await expect(page.getByRole('img',{name:'Team Member · '+side+' photo'})).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Asia/Dhaka');
  await page.getByRole('button',{name:'Back to attendance details',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Team Member');
  await expect(page.getByRole('dialog')).toContainText('Assigned slot');
  await expect(page.getByRole('button',{name:side+' photo',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Close dialog'}).click();
 }
 allowed=false;
 await page.reload();
 await page.getByRole('button',{name:'Attendance',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check-in photo',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Check-out photo',exact:true})).toHaveCount(0);
});

test('page URLs survive refresh, direct links and browser history', async ({page})=>{
 await workspace(page,true);
 await page.getByRole('button',{name:'Attendance',exact:true}).click();
 await expect(page).toHaveURL(/\/attendance$/);
 await page.reload();
 await expect(page.getByRole('button',{name:'Attendance',exact:true})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Requests',exact:true}).click();
 await expect(page).toHaveURL(/\/requests$/);
 await page.goBack();
 await expect(page).toHaveURL(/\/attendance$/);
 await expect(page.getByRole('button',{name:'Attendance',exact:true})).toHaveAttribute('aria-current','page');
 await page.goForward();
 await expect(page.getByRole('button',{name:'Requests',exact:true})).toHaveAttribute('aria-current','page');
 for(const [name,path] of [['My teams','teams'],['People','people'],['Roles','roles'],['Permissions','permissions'],['Team home office','team-home-office'],['My profile','profile']]){
  await page.goto('/'+path);
  await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
 }
 await page.goto('/#requests');
 await expect(page).toHaveURL(/\/requests$/);
 await page.goto('/missing-page');
 await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
 await page.getByRole('button',{name:'Go to overview'}).click();
 await expect(page).toHaveURL(/\/overview$/);
});
