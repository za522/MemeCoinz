import { ResearchConsole, type AppScreen } from "./research-console";

interface HomeProps {
  searchParams?: Promise<{
    screen?: string | string[];
    term?: string | string[];
  }>;
}

const SCREENS = new Set<AppScreen>(["coins", "report", "methods"]);

export default async function Home({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : {};
  const requestedScreen = typeof params.screen === "string" ? params.screen : "coins";
  const initialScreen = SCREENS.has(requestedScreen as AppScreen)
    ? requestedScreen as AppScreen
    : "coins";
  const initialTerm = typeof params.term === "string" ? params.term.slice(0, 120) : "";
  return (
    <ResearchConsole
      initialScreen={initialScreen}
      initialTerm={initialTerm}
    />
  );
}
