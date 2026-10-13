import { notFound } from "next/navigation";

// Unknown paths fall through to the localized not-found page.
export default function CatchAll() {
  notFound();
}
