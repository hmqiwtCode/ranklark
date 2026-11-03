import { ExtensionClient } from "@/features/extension/components/extension-dashboard";
import { EXTENSION_ID } from "@/features/extension/extension-id";

export const dynamic = "force-dynamic";
export const metadata = { title: "Browser extension — Ranklark" };

export default function ExtensionPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-[30px] font-extrabold tracking-tight">Browser extension</h1>
      <p className="mb-6 mt-1 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Apple allows about 20 searches a minute per internet connection. The extension checks your keywords from{" "}
        <b className="text-ink">your own Chrome</b>, so every user has their own limit — and nothing slows down as more people use Ranklark.
      </p>
      <ExtensionClient extensionId={EXTENSION_ID} storeUrl={process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ?? null} />
    </main>
  );
}
