import type { ComponentType } from "react";
import { bangunPeta, type Peta } from "../kit/timemap";
import { POTONG } from "./potong";
import { DUR as DUR_DAFTAR, Daftar } from "./daftar";
import { DUR as DUR_MULAI, Mulai } from "./mulai";
import { DUR as DUR_SAMBUNG, Sambung } from "./sambung";
import { DUR as DUR_KNOWLEDGE, Knowledge } from "./knowledge";
import { DUR as DUR_UJI, Uji } from "./uji";
import { DUR as DUR_ATUR, Atur } from "./atur";
import { DUR as DUR_LIVE, Live } from "./live";
import { DUR as DUR_PANTAU, Pantau } from "./pantau";
import { DUR as DUR_LANGGANAN, Langganan } from "./langganan";
import { DUR as DUR_AFILIASI, Afiliasi } from "./afiliasi";
import { DUR as DUR_OUTRO, Outro } from "./outro";
import { Intro } from "./intro";
import { DUR as DUR_LANDING, Landing } from "./landing";

export interface SceneDef {
  id: string;
  /** Durasi video scene (detik) setelah dipotong/dipercepat. */
  dur: number;
  /** Peta waktu asli -> video. */
  peta: Peta;
  /** Tampilkan lencana kecepatan saat dipercepat. */
  chip: boolean;
  Comp: ComponentType;
}

const buat = (id: string, Comp: ComponentType, durAsli: number, chip = true): SceneDef => {
  const peta = bangunPeta(POTONG[id] ?? [{ a: 0, b: durAsli, v: 1 }]);
  return { id, dur: peta.dur, peta, chip, Comp };
};

/** Urutan scene video demo. Tiap scene tumpang-tindih 0,4 dtk dengan sebelumnya (silang-pudar). */
export const SCENES: SceneDef[] = [
  buat("intro", Intro, 7, false),
  buat("landing", Landing, DUR_LANDING),
  buat("daftar", Daftar, DUR_DAFTAR),
  buat("mulai", Mulai, DUR_MULAI),
  buat("sambung", Sambung, DUR_SAMBUNG),
  buat("knowledge", Knowledge, DUR_KNOWLEDGE),
  buat("uji", Uji, DUR_UJI),
  buat("atur", Atur, DUR_ATUR),
  buat("live", Live, DUR_LIVE),
  buat("pantau", Pantau, DUR_PANTAU),
  buat("langganan", Langganan, DUR_LANGGANAN),
  buat("afiliasi", Afiliasi, DUR_AFILIASI),
  buat("outro", Outro, DUR_OUTRO, false),
];

const TUMPANG = 0.4;
export const mulaiScene = (i: number) => SCENES.slice(0, i).reduce((a, s) => a + s.dur - TUMPANG, 0);
export const TOTAL_DETIK = SCENES.reduce((a, s) => a + s.dur, 0) - TUMPANG * (SCENES.length - 1);
