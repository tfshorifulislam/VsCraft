import { Header } from "../components/Header";

export default function HomePage() {
  return (
    <main className="p-8">
      <Header />
      <h1 className="text-2xl font-bold">Imported Real Local Project</h1>
      <p>Loaded from PC into Cloud Monaco Editor</p>
    </main>
  );
}

