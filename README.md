# FraguaGo — API (NestJS)

Multi-tenant backend for the FraguaGo gym SaaS.

Each gym is a tenant, and NestJS enforces tenant isolation by scoping application queries with the `gymId` belonging to the authenticated user.

The API uses:

* **NestJS** — backend framework
* **Prisma** — ORM
* **PostgreSQL** — database
* **JWT** — authentication
* **bcrypt** — password hashing
* **Docker** — local development environment

No external authentication provider is required.

---

## Getting started

### Install dependencies

```bash
yarn install
```

### Environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Configure your database and JWT secret:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fraguago"

JWT_SECRET="your-long-secure-secret"

WHATSAPP_DEFAULT_COUNTRY_CODE="57"
```

### Generate Prisma Client

```bash
yarn prisma generate
```

### Run database migrations

```bash
yarn prisma migrate dev
```

### Start the API

```bash
yarn start:dev
```

The API will be available at:

```text
http://localhost:3001/api
```

---

## Docker

The API can also be run using Docker Compose.

Build the containers:

```bash
docker compose build
```

Start the application:

```bash
docker compose up -d
```

View the logs:

```bash
docker compose logs -f
```

Stop the containers:

```bash
docker compose down
```

---

# Authentication

FraguaGo uses its own authentication system based on JWT.

There is no dependency on Supabase Auth or another external authentication provider.

## Login flow

1. The frontend calls:

```text
POST /api/auth/login
```

with the user's email and password.

2. NestJS searches for the user in PostgreSQL through Prisma.

3. The password is verified using `bcrypt`.

4. NestJS generates a JWT containing the authenticated user's identity and tenant information.

5. The API returns an `accessToken`.

6. Protected requests send the token using:

```http
Authorization: Bearer <token>
```

7. `JwtAuthGuard` validates the token.

8. `JwtStrategy` loads the authenticated user information into the request.

The authenticated user contains:

```typescript
{
  id,
  email,
  gymId,
  role
}
```

---

## Multi-tenancy

Each gym represents a tenant.

The authenticated user's JWT contains the `gymId` associated with their profile.

Protected controllers can access the tenant through the `@GymId()` decorator.

Example:

```typescript
@Get()
findAll(@GymId() gymId: string) {
  return this.service.findAll(gymId);
}
```

Services are responsible for applying the tenant filter to every query.

Example:

```typescript
return this.prisma.member.findMany({
  where: {
    gymId,
  },
});
```

This prevents users from accessing data belonging to another gym.

The tenant isolation strategy is:

```text
JWT
 │
 ├── user id
 ├── gymId
 └── role
      │
      ▼
JwtAuthGuard
      │
      ▼
@CurrentUser()
@GymId()
      │
      ▼
Controller
      │
      ▼
Service
      │
      ▼
Prisma
      │
      ▼
WHERE gymId = authenticated user's gymId
```

---

# Creating a gym

A new gym and its owner are created through:

```text
POST /api/auth/register-gym
```

The operation creates:

1. The gym/tenant.
2. The owner profile.
3. The password hash.

The gym and owner creation should be performed inside a Prisma transaction so that the operation is atomic.

No Supabase `service_role` key or external authentication service is required.

---

# Project structure

```text
src/
├─ auth/
│  ├─ auth.controller.ts
│  ├─ auth.service.ts
│  ├─ jwt-auth.guard.ts
│  ├─ jwt.strategy.ts
│  ├─ decorators/
│  │  ├─ current-user.decorator.ts
│  │  ├─ gym-id.decorator.ts
│  │  └─ roles.decorator.ts
│  └─ dto/
│     ├─ login.dto.ts
│     └─ register-gym.dto.ts
│
├─ common/
│  ├─ roles.guard.ts
│  └─ audit.interceptor.ts
│
├─ prisma/
│  ├─ prisma.module.ts
│  └─ prisma.service.ts
│
└─ modules/
   ├─ members/            # Reference module
   ├─ membership-plans/   # Membership plans
   ├─ routines/           # Member routines
   ├─ finances/           # Income and expenses
   ├─ concepts/           # Transaction categories
   ├─ services/           # Gym services
   ├─ trainers/           # Trainers
   ├─ schedules/          # Classes / timetable
   ├─ history/            # Member history
   ├─ logs/               # Audit trail
   ├─ attendance/         # Daily member check-in
   ├─ products/           # Products and inventory
   ├─ sales/              # POS
   ├─ progress/           # Measurements and weight tracking
   ├─ memberships/        # Member memberships
   ├─ reports/            # Dashboard reports
   └─ reminders/          # Payment reminders
```

---

# API endpoints

All endpoints are prefixed with:

```text
/api
```

## Authentication

```text
POST /auth/login
POST /auth/register-gym
GET  /auth/me
```

`GET /auth/me` requires authentication.

---

## Members

Standard CRUD:

```text
POST   /members
GET    /members
GET    /members/:id
PATCH  /members/:id
DELETE /members/:id
```

Members represent the gym's clients/socios.

---

## Membership plans

```text
POST   /membership-plans
GET    /membership-plans
GET    /membership-plans/:id
PATCH  /membership-plans/:id
DELETE /membership-plans/:id
```

---

## Routines

```text
POST   /routines
GET    /routines
GET    /routines/:id
PATCH  /routines/:id
DELETE /routines/:id
```

---

## Concepts

```text
POST   /concepts
GET    /concepts
GET    /concepts/:id
PATCH  /concepts/:id
DELETE /concepts/:id
```

Concepts represent categories used by financial transactions.

---

## Services

```text
POST   /services
GET    /services
GET    /services/:id
PATCH  /services/:id
DELETE /services/:id
```

---

## Trainers

```text
POST   /trainers
GET    /trainers
GET    /trainers/:id
PATCH  /trainers/:id
DELETE /trainers/:id
```

---

## Schedules

```text
POST   /schedules
GET    /schedules
GET    /schedules/:id
PATCH  /schedules/:id
DELETE /schedules/:id
```

---

# Finances

Income and expenses are managed through a single `Transaction` model.

Transactions have a `type`:

```text
INCOME
EXPENSE
```

This avoids duplicated logic between income and expense management.

Endpoints:

```text
POST /transactions
GET  /transactions?type=INCOME
GET  /transactions?type=EXPENSE
GET  /transactions/summary

GET    /transactions/:id
PATCH  /transactions/:id
DELETE /transactions/:id
```

The summary endpoint returns:

```text
income
expense
balance
```

The balance is calculated as:

```text
income - expense
```

---

# Member history

```text
GET /history/member/:memberId
```

Returns aggregated information about a member, including memberships and payments.

The requested member must belong to the authenticated user's gym.

---

# Audit logs

```text
GET /logs
```

Access is restricted to:

```text
OWNER
ADMIN
```

The audit interceptor automatically records relevant operations.

---

# Attendance

Member check-in:

```text
POST /attendance/check-in
```

Today's attendance:

```text
GET /attendance/today
```

Member attendance history:

```text
GET /attendance/member/:memberId
```

---

# Products

Products provide inventory management.

```text
POST   /products
GET    /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id
```

---

# Sales / POS

Create a sale:

```text
POST /sales
```

List sales:

```text
GET /sales
```

A sale automatically:

1. Creates the sale.
2. Decreases the corresponding product stock.
3. Creates an `INCOME` transaction.

These operations should be handled atomically.

---

# Progress

Member progress and measurements:

```text
POST   /progress
GET    /progress
GET    /progress/:id
PATCH  /progress/:id
DELETE /progress/:id
```

---

# Memberships

Create a membership:

```text
POST /memberships
```

List memberships:

```text
GET /memberships
```

List memberships expiring soon:

```text
GET /memberships/expiring?days=7
```

---

# Reports

Owner dashboard:

```text
GET /reports/dashboard
```

Access is restricted to:

```text
OWNER
ADMIN
```

The dashboard aggregates information such as:

* Members
* Attendance
* Income
* Expenses
* Balance
* Membership information

All metrics are scoped to the authenticated gym.

---

# Member ID card

```text
GET /members/:id/card
```

Returns the data required by the frontend to generate a member ID card.

The member must belong to the authenticated gym.

---

# Payment reminders

Payment reminders are based on membership expiration dates.

## Manual reminders

```text
GET /reminders?days=7
```

The endpoint returns memberships that are close to expiration.

Each reminder contains a ready-to-use WhatsApp `wa.me` link with a Spanish message.

The gym owner can open the link and send the message manually.

This model has no messaging cost because the owner sends the message directly through WhatsApp.

---

## Automatic reminders

A daily cron job runs at 8:00 AM.

The cron processes memberships across all gyms and prepares the same reminder batch.

In the free model, the cron only logs a summary.

There is a clearly marked extension point for integrating:

* Twilio
* WhatsApp Cloud API

Automatic WhatsApp messaging may incur provider/message costs.

Set the following variable in `.env`:

```env
WHATSAPP_DEFAULT_COUNTRY_CODE="57"
```

This is used to add the appropriate country code to local phone numbers when generating WhatsApp links.

---

# Adding a new module

New modules should follow the same multi-tenant pattern.

Create a folder under:

```text
src/modules/
```

A typical module contains:

```text
module/
├─ module.ts
├─ controller.ts
├─ service.ts
└─ dto/
```

The service receives the authenticated `gymId` and scopes every database query to that tenant.

Example:

```typescript
async findAll(gymId: string) {
  return this.prisma.example.findMany({
    where: {
      gymId,
    },
  });
}
```

The controller obtains the tenant using:

```typescript
@GymId()
```

and authentication should be enforced using:

```typescript
@UseGuards(JwtAuthGuard)
```

For role-based authorization, use the existing roles decorator and guard.

---

# Validation

The `members` module serves as the reference implementation for DTO validation.

It uses:

```text
class-validator
class-transformer
```

New modules should follow the same pattern.

Important business validations include:

* Duplicate member prevention
* Minor/member rules
* Required fields
* Tenant ownership
* Role-based access

---

# Database

FraguaGo uses PostgreSQL through Prisma.

The application does not depend on Supabase-specific database features.

Generate the Prisma client:

```bash
yarn prisma generate
```

Create and apply migrations:

```bash
yarn prisma migrate dev
```

Inspect the database with Prisma Studio:

```bash
yarn prisma studio
```

---

# Security

Authentication uses:

```text
JWT
bcrypt
```

Passwords must never be stored in plain text.

Only password hashes are stored in PostgreSQL.

JWTs contain the minimum information required by the API, including:

```text
sub
email
gymId
role
```

Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

Tenant isolation is enforced at the application level by requiring services to filter queries using the authenticated user's `gymId`.

Client-provided `gymId` values should never be trusted for authorization.

The `gymId` used for authorization must come from the authenticated JWT.

---

# Environment variables

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fraguago"

JWT_SECRET="your-long-secure-secret"

WHATSAPP_DEFAULT_COUNTRY_CODE="57"
```

Do not commit `.env` files or production secrets to the repository.

---

# Development commands

Install dependencies:

```bash
yarn install
```

Start development server:

```bash
yarn start:dev
```

Build:

```bash
yarn build
```

Start production:

```bash
yarn start:prod
```

Generate Prisma client:

```bash
yarn prisma generate
```

Run migrations:

```bash
yarn prisma migrate dev
```

Open Prisma Studio:

```bash
yarn prisma studio
```

Run tests:

```bash
yarn test
```

---

# Architecture overview

```text
                    ┌──────────────────┐
                    │    Frontend      │
                    └────────┬─────────┘
                             │
                             │ JWT
                             ▼
                    ┌──────────────────┐
                    │     NestJS       │
                    │                  │
                    │ JwtAuthGuard     │
                    │ JwtStrategy      │
                    │ RolesGuard       │
                    └────────┬─────────┘
                             │
                    gymId + user + role
                             │
                             ▼
                    ┌──────────────────┐
                    │    Services      │
                    │                  │
                    │ Tenant filtering │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │      Prisma      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    └──────────────────┘
```

---

# Design principles

FraguaGo follows these principles:

1. **One gym = one tenant.**
2. **Authentication belongs to the application.**
3. **Passwords are hashed with bcrypt.**
4. **JWT is used for stateless authentication.**
5. **`gymId` comes from the authenticated user, never from client input for authorization.**
6. **Every tenant-owned query must be scoped by `gymId`.**
7. **Financial operations should be atomic.**
8. **Sales update inventory and finances together.**
9. **Audit logs provide traceability for relevant operations.**
10. **The API must not depend on Supabase-specific authentication services.**
11. **PostgreSQL is the source of truth for application data.**
12. **Modules should follow the same controller → service → Prisma pattern.**
