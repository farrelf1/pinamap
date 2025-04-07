// app/api/submit/route.ts
import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const { message, receiver, latitude, longitude } = body;

  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        message,
        receiver,
        latitude,
        longitude,
        time: new Date().toISOString(),
      },
    ])
    .select(); // important: return inserted row(s)

  if (error) {
    console.error('Supabase insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
