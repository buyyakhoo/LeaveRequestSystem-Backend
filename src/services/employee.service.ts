import { db } from "../db/index";
import { hashPassword } from "../lib/password";
import { logEvent } from "./event-log.service";

// ─── GET /employees ─────────────────────────────────────────
// scenario: HR เปิดหน้า dashboard ดูรายชื่อพนักงานทั้งหมด
export const getEmployees = async (
  actorRole: string,
  actorDepartment: string | null,
) => {
  console.log("role:", actorRole, "department:", actorDepartment);
  // manager เห็นเฉพาะแผนกตัวเอง, admin เห็นทั้งหมด
  if (actorRole === "manager" && actorDepartment) {
    const result = await db.query(
      `SELECT id, employee_code, email, first_name, last_name,
              department, role, status, created_at
       FROM employees
       WHERE department = $1
       ORDER BY created_at DESC`,
      [actorDepartment],
    );
    return result.rows;
  }

  const result = await db.query(
    `SELECT id, employee_code, email, first_name, last_name,
            department, role, status, created_at
     FROM employees
     ORDER BY created_at DESC`,
  );
  return result.rows;
};

// ─── GET /employees/:id ──────────────────────────────────────
// scenario: HR คลิกดูรายละเอียดพนักงานคนนึง
export const getEmployeeById = async (id: string) => {
  const result = await db.query(
    `SELECT id, employee_code, email, first_name, last_name,
            department, role, status, created_at
     FROM employees WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
};

// ─── POST /employees ─────────────────────────────────────────
// scenario: HR กดปุ่ม "เพิ่มพนักงานใหม่" แล้วกรอกฟอร์ม
export const createEmployee = async (
  data: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    department?: string;
    role?: string;
    employeeCode?: string;
  },
  actorId: string,
  actorRole: string,
) => {
  // เช็คว่า email ซ้ำไหม
  const existing = await db.query("SELECT id FROM employees WHERE email = $1", [
    data.email,
  ]);
  if (existing.rows[0]) {
    throw new Error("EMAIL_EXISTS");
  }

  const hash = await hashPassword(data.password);

  const result = await db.query(
    `INSERT INTO employees 
      (email, first_name, last_name, department, role, employee_code)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, department, role, status`,
    [
      data.email,
      data.firstName,
      data.lastName,
      data.department ?? null,
      data.role ?? "user",
      data.employeeCode ?? null,
    ],
  );

  const newEmployee = result.rows[0];

  // สร้าง identity สำหรับ local login
  await db.query(
    `INSERT INTO employee_identities (employee_id, provider, password_hash)
     VALUES ($1, 'local', $2)`,
    [newEmployee.id, hash],
  );

  // บันทึก event log
  await logEvent({
    actorId,
    actorRole,
    action: "ADD_USER",
    targetId: newEmployee.id,
    targetType: "employee",
    detail: { email: data.email, role: data.role ?? "user" },
  });

  return newEmployee;
};

// ─── PATCH /employees/:id/disable ───────────────────────────
// scenario: HR กดปุ่ม DISABLED ข้างชื่อพนักงานที่ลาออก
export const disableEmployee = async (
  id: string,
  actorId: string,
  actorRole: string,
) => {
  const emp = await db.query(
    "SELECT id, status, role FROM employees WHERE id = $1",
    [id],
  );

  if (!emp.rows[0]) throw new Error("NOT_FOUND");
  if (emp.rows[0].status === "disabled") throw new Error("ALREADY_DISABLED");
  if (emp.rows[0].role === "admin") throw new Error("CANNOT_DISABLE_ADMIN");

  await db.query(
    `UPDATE employees SET status = 'disabled', updated_at = NOW()
     WHERE id = $1`,
    [id],
  );

  await logEvent({
    actorId,
    actorRole,
    action: "DISABLE_USER",
    targetId: id,
    targetType: "employee",
  });

  return { message: "Disabled successfully" };
};

// ─── PATCH /employees/:id/profile ───────────────────────────
// scenario: พนักงานแก้ข้อมูลตัวเอง (ชื่อ, แผนก)
export const updateProfile = async (
  id: string,
  data: { firstName?: string; lastName?: string; department?: string },
  actorId: string,
  actorRole: string,
) => {
  const result = await db.query(
    `UPDATE employees
     SET first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         department = COALESCE($3, department),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, email, first_name, last_name, department, role, status`,
    [
      data.firstName ?? null,
      data.lastName ?? null,
      data.department ?? null,
      id,
    ],
  );

  await logEvent({
    actorId,
    actorRole,
    action: "UPDATE_PROFILE",
    targetId: id,
    targetType: "employee",
  });

  return result.rows[0];
};
