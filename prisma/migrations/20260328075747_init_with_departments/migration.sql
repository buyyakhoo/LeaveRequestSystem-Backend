-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('local', 'google');

-- CreateEnum
CREATE TYPE "employee_role" AS ENUM ('user', 'manager', 'admin');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "leave_type" AS ENUM ('sick', 'vacation', 'personal', 'maternity', 'ordain', 'other');

-- CreateEnum
CREATE TYPE "leave_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" VARCHAR(20),
    "email" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "department_id" INTEGER,
    "role" "employee_role" DEFAULT 'user',
    "status" "employee_status" DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "provider" "auth_provider" DEFAULT 'local',
    "password_hash" VARCHAR(255),
    "provider_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "leave_type" "leave_type" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "delegate_name" VARCHAR(255),
    "status" "leave_status" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_role" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "target_id" UUID,
    "target_type" VARCHAR(30),
    "detail" JSONB,
    "result" VARCHAR(20) NOT NULL DEFAULT 'success',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "idx_employees_email" ON "employees"("email");

-- CreateIndex
CREATE INDEX "idx_identities_employee_id" ON "employee_identities"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_provider_id" ON "employee_identities"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "idx_leave_employee" ON "leave_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "idx_event_logs_actor" ON "event_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_event_logs_time" ON "event_logs"("timestamp" DESC);

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_identities" ADD CONSTRAINT "employee_identities_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
