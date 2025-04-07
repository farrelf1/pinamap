import { supabase } from '../../../../lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('receiver');

  if (!search) {
    return NextResponse.json({ error: 'Missing receiver' }, { status: 400 });
  }

  const { data, error } = await supabase
  .from('messages')
  .select('*')
  .filter('receiver', 'ilike', search);


  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
