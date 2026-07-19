// sync-results — Supabase edge function (Deno)
//
// Henter alle VM-kamper fra football-data.org og skriver ferdige resultater til
// tk_match_results. Ingen menneskelig utfylling. Rettferdig fordi:
//
//   1. Bare FINISHED/AWARDED-kamper teller — aldri en mellomstilling.
//   2. Sluttspill scores på 90 min (fullTime inkluderer ekstraomganger).
//   3. Vi overskriver kun når noe faktisk har endret seg, og gjør det hver gang
//      funksjonen kjøres — så en sen VAR-korreksjon eller AWARDED-omgjøring
//      retter seg selv ved neste sync. Stillingen regnes live, så ingen
//      egen re-scoring trengs.
//
// Returnerer { updated, total_finished } — samme format som admin.js/autoSync
// allerede forventer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COMPETITION = "WC";

// Env: SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY injiseres automatisk.
// FOOTBALL_DATA_TOKEN må settes manuelt (se note nederst). Bruker samme navn
// som din eksisterende "football"-funksjon hvis det er et annet, bytt her.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FD_TOKEN = Deno.env.get("FOOTBALL_DATA_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 90-minutters score. fullTime fra football-data inkluderer ekstraomganger i
// sluttspill, så der bruker vi regularTime. Gruppespill: fullTime.
// NB: football-data kan levere regularTime som {home: null, away: null} selv
// når kampen gikk til ekstraomganger (skjedde i VM-finalen 2026) — et rent
// `regularTime ?? fullTime` velger da det tomme objektet og kampen hoppes
// over for alltid. Fall i stedet tilbake til fullTime minus extraTime-målene.
function ninetyScore(m: any) {
  const knockout = m.stage && m.stage !== "GROUP_STAGE";
  const ft = m.score?.fullTime;
  let s = ft;
  if (knockout) {
    const rt = m.score?.regularTime;
    const et = m.score?.extraTime;
    if (rt?.home != null && rt?.away != null) {
      s = rt;
    } else if (
      m.score?.duration && m.score.duration !== "REGULAR" &&
      ft?.home != null && et?.home != null && et?.away != null
    ) {
      s = { home: ft.home - et.home, away: ft.away - et.away };
    }
  }
  return {
    knockout,
    home: s?.home ?? null,
    away: s?.away ?? null,
  };
}

// Hvem gikk videre (kun sluttspill, kun for bracket-visning — gir ingen poeng).
// score.winner tar høyde for ekstraomganger og straffer.
function advancer(m: any): "HOME" | "AWAY" | null {
  if (m.score?.winner === "HOME_TEAM") return "HOME";
  if (m.score?.winner === "AWAY_TEAM") return "AWAY";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) Alle kamper i ett kall (1 request — godt innenfor 10/min på free tier).
    const res = await fetch(
      `https://api.football-data.org/v4/competitions/${COMPETITION}/matches`,
      { headers: { "X-Auth-Token": FD_TOKEN } },
    );
    if (!res.ok) {
      return json({ error: `football-data ${res.status}`, updated: 0 }, 502);
    }
    const data = await res.json();
    const matches: any[] = data.matches || [];

    // 2) Nåværende lagrede resultater, for å skrive bare når noe har endret seg.
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: existing, error: readErr } = await supabase
      .from("tk_match_results")
      .select("match_id, home_goals, away_goals, winner");
    if (readErr) return json({ error: readErr.message, updated: 0 }, 500);

    const cur = new Map((existing || []).map((r: any) => [r.match_id, r]));

    // 3) Finn ferdige kamper og bygg liste over rader som faktisk skal endres.
    const finished = matches.filter(
      (m) => m.status === "FINISHED" || m.status === "AWARDED",
    );

    const toUpsert: any[] = [];
    for (const m of finished) {
      const { knockout, home, away } = ninetyScore(m);
      if (home === null || away === null) continue; // ferdig, men score mangler — hopp over

      const winner = knockout ? advancer(m) : null;
      const prev = cur.get(m.id);

      const changed =
        !prev ||
        prev.home_goals !== home ||
        prev.away_goals !== away ||
        (knockout && (prev.winner ?? null) !== winner);

      if (changed) {
        const row: any = { match_id: m.id, home_goals: home, away_goals: away };
        if (knockout) row.winner = winner; // bracket; ikke poenggivende
        toUpsert.push(row);
      }
    }

    // 4) Én batch-upsert for alt som har endret seg.
    if (toUpsert.length) {
      const { error: writeErr } = await supabase
        .from("tk_match_results")
        .upsert(toUpsert, { onConflict: "match_id" });
      if (writeErr) return json({ error: writeErr.message, updated: 0 }, 500);
    }

    return json({ updated: toUpsert.length, total_finished: finished.length });
  } catch (err) {
    return json({ error: String(err), updated: 0 }, 500);
  }
});
