import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testDb, resetDb } from "../helpers/db";

const sendEmail = vi.fn<(args: { to: string }) => Promise<void>>();
vi.mock("@/lib/email/send", () => ({ sendEmail: (a: { to: string }) => sendEmail(a) }));

const { dispatchQueuedNotifications } = await import("@/lib/services/notification-dispatch");
const { enqueueNotification } = await import("@/lib/services/notification");

beforeEach(async () => {
  await resetDb();
  sendEmail.mockReset();
});
afterAll(async () => {
  await testDb.$disconnect();
});

async function queue(n: number) {
  for (let i = 0; i < n; i++) {
    await enqueueNotification(testDb, {
      type: "REGISTRATION_CONFIRMED",
      recipientEmail: `equipo${i}@test.local`,
      payload: { teamName: `Equipo ${i}` },
    });
  }
}

describe("dispatchQueuedNotifications", () => {
  it("enqueue fuera de un request no rompe y deja la fila en cola", async () => {
    await queue(1);
    const n = await testDb.notification.findFirstOrThrow();
    expect(n.status).toBe("QUEUED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("dos despachos en paralelo no mandan ningún email dos veces", async () => {
    await queue(5);
    sendEmail.mockImplementation(() => new Promise((r) => setTimeout(r, 20)));

    const [a, b] = await Promise.all([dispatchQueuedNotifications(), dispatchQueuedNotifications()]);

    expect(a.sent + b.sent).toBe(5);
    expect(sendEmail).toHaveBeenCalledTimes(5);
    const to = sendEmail.mock.calls.map((c) => c[0].to).sort();
    expect(new Set(to).size).toBe(5);
    const rows = await testDb.notification.findMany();
    expect(rows.every((r) => r.status === "SENT" && r.sentAt)).toBe(true);
  });

  it("si el SMTP falla queda FAILED, no SENT", async () => {
    await queue(1);
    sendEmail.mockRejectedValue(new Error("smtp caído"));
    const r = await dispatchQueuedNotifications();
    expect(r.failed).toBe(1);
    const n = await testDb.notification.findFirstOrThrow();
    expect(n.status).toBe("FAILED");
    expect(n.sentAt).toBeNull();
    expect(n.error).toContain("smtp caído");
  });
});
