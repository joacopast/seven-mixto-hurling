import { signOut } from "@/lib/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2"
      >
        Salir
      </button>
    </form>
  );
}
