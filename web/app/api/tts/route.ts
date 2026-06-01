export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Text-to-speech via Google Cloud TTS (NotebookLM-grade Neural2 voices). Returns
// an MP3 for the given text. Needs GOOGLE_TTS_API_KEY; without it returns 503 so
// the client falls back to the browser's built-in speech synthesis.
export async function POST(req: Request) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return Response.json({ configured: false }, { status: 503 });

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = body.text ?? "";
  } catch {
    // ignore
  }
  text = text.slice(0, 1200).trim();
  if (!text) return Response.json({ error: "no text" }, { status: 400 });

  try {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text },
        // British male Neural2 voice — broadcaster cadence.
        voice: { languageCode: "en-GB", name: "en-GB-Neural2-B" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: -1.0 },
      }),
    });
    if (!r.ok) {
      console.error("google tts error:", r.status, await r.text());
      return Response.json({ error: "tts failed" }, { status: 502 });
    }
    const { audioContent } = (await r.json()) as { audioContent: string };
    const bytes = Buffer.from(audioContent, "base64");
    return new Response(bytes, {
      headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=86400" },
    });
  } catch (e) {
    console.error("tts exception:", e);
    return Response.json({ error: "tts exception" }, { status: 502 });
  }
}
