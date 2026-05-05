# Maintenance Scheduler Project Specification

This document serves as the architectural blueprint and source of truth for the development of the Next.js Maintenance Scheduler application.

---

## 🤖 Custom Agent Instructions

**Role:** Senior Full-Stack Engineer (Next.js, Prisma, & UI Specialist)  
**Objective:** Build a high-performance, interactive maintenance timeline with complex drag-and-drop and zoom capabilities.

### Key Implementation Rules:
*   **State Logic:** Use **Zustand** for all non-persisted UI state (zoom levels, current date view, modal states).
*   **Database:** Strictly use **Prisma with Neon (PostgreSQL)**. All schema changes must be followed by `npx prisma generate`.
*   **Timeline Math:** Use **date-fns** for all X-axis calculations. Do not manually calculate milliseconds for dates to avoid timezone bugs.
*   **Drag-and-Drop:** Use **@dnd-kit**. When a task is dropped, immediately trigger an optimistic UI update in Zustand before awaiting the Server Action.
*   **Emails:** Use **Resend** for notification logic. Stub the API key in development but ensure the logic for "Worker Alerts" is robust.

---

## 🛠️ Technical Stack

| Component | Technology |
| :--- | :--- |
| **Framework** | Next.js 15+ (App Router) |
| **State Management** | Zustand |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Database** | Neon (Serverless PostgreSQL) |
| **ORM** | Prisma |
| **Interactions** | @dnd-kit/core |
| **Date Math** | date-fns |
| **Notifications** | Resend |

---

## 🗄️ Database Schema (Prisma)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Equipment {
  id           String            @id @default(cuid())
  name         String            @unique
  category     String?
  tasks        MaintenanceTask[]
  createdAt    DateTime          @default(now())
}

model MaintenanceTask {
  id           String    @id @default(cuid())
  title        String
  description  String?
  startTime    DateTime
  endTime      DateTime
  assignedTo   String    // Email of the worker to be notified
  equipmentId  String
  equipment    Equipment @relation(fields: [equipmentId], references: [id], onDelete: Cascade)
  status       String    @default("scheduled") 
}
```

---

## 🧭 Core Application Architecture

### 1. Timeline UI Engine
The dashboard is built on a responsive grid system where:
*   **X-Axis (Time):** Generates headers dynamically using `date-fns`.
    *   **Yearly View:** Columns = Months.
    *   **Monthly View:** Columns = Days.
    *   **Weekly View:** Columns = Days/Half-days.
    *   **Daily View:** Columns = Hours.
*   **Y-Axis (Equipment):** A sticky left-side navigation displaying the registered equipment names.
*   **Interaction Layer:** Clicking a grid intersection opens the "Schedule Task" modal.

### 2. State Management (Zustand)
Synchronizes the zoom levels and viewport without unnecessary prop drilling.

```typescript
interface TimelineState {
  viewMode: 'day' | 'week' | 'month' | 'year';
  anchorDate: Date;
  zoomLevel: number; // Pixels per hour/day
  setViewMode: (mode: 'day' | 'week' | 'month' | 'year') => void;
  setAnchorDate: (date: Date) => void;
}
```

### 3. Drag-and-Drop Logic
*   **Constraint:** Tasks can be dragged horizontally (Time) and vertically (Equipment swap).
*   **Database Sync:** On `onDragEnd`, a server action updates the `startTime`, `endTime`, and `equipmentId`.

---

## 🏗️ Feature Implementation Requirements

### 1. The Dashboard
*   Implement a **"Zoom Slider"** to adjust the `zoomLevel` in Zustand.
*   Render tasks as absolute-positioned elements.
*   **Formula:** `left = differenceInMinutes(taskStart, viewportStart) * scaleFactor`.

### 2. Email Notification System
*   Triggered on `TaskCreated` or `TaskMoved`.
*   Worker receives: *"New Assignment: [Title] for [Equipment] on [Date]"*.

### 3. Equipment Management
*   Add **"Add Equipment"** button in the sidebar.
*   Default equipment seeded via `prisma/seed.ts`.

---

## 📝 Seed Data (Default Equipment)

```json
[
  { "name": "Hydraulic Press A-101", "category": "Heavy Machinery" },
  { "name": "CNC Lathe (Primary)", "category": "Precision Tools" },
  { "name": "Industrial Boiler #4", "category": "Infrastructure" },
  { "name": "Conveyor Belt - Main Line", "category": "Logistics" },
  { "name": "HVAC Unit (South Wing)", "category": "Facilities" }
]
```

---

## 🚀 Deployment & Environment

*   **Vercel:** Hosting.
*   **Neon:** Postgres.
*   **Env Vars:** 
    *   `DATABASE_URL`
    *   `RESEND_API_KEY`