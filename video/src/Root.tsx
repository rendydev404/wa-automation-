import "@fontsource-variable/plus-jakarta-sans";
import { Composition } from "remotion";
import { DURASI_KONTEN, KontenHook } from "./konten/KontenHook";
import { DURASI_SOFT_E1, SoftE1 } from "./konten/SoftE1";
import { DURASI, Promo } from "./Promo";

export function Root() {
  return (
    <>
      <Composition id="Promo" component={Promo} durationInFrames={DURASI} fps={30} width={1080} height={1920} />
      <Composition id="KontenHook" component={KontenHook} durationInFrames={DURASI_KONTEN} fps={30} width={1080} height={1920} />
      <Composition id="SoftE1" component={SoftE1} durationInFrames={DURASI_SOFT_E1} fps={30} width={1080} height={1920} />
    </>
  );
}
