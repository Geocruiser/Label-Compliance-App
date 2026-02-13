import { VerificationWorkbench } from "@/components/verification-workbench";

const HomePage = () => {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Label Compliance App
        </h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-700">
          Upload one or more label images and application JSON files, then run
          verification to generate results with evidence highlighting.
        </p>
      </header>
      <VerificationWorkbench />
    </main>
  );
};

export default HomePage;
