import "@fontsource-variable/plus-jakarta-sans";
import { Composition } from "remotion";
import { DURASI, Promo } from "./Promo";

export function Root() {
  return <Composition id="Promo" component={Promo} durationInFrames={DURASI} fps={30} width={1080} height={1920} />;
}
