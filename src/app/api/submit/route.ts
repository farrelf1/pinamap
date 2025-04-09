// app/api/submit/route.ts
import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    // Check if content-type is multipart/form-data
    const contentType = req.headers.get('content-type');
    const isMultipart = contentType?.includes('multipart/form-data');

    if (!isMultipart) {
      // Handle JSON-only submission (backward compatibility)
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
            has_image: false,
          },
        ])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // Handle multipart/form-data with file upload
    const formData = await req.formData();
    const message = formData.get('message') as string;
    const receiver = formData.get('receiver') as string;
    const latitude = formData.get('latitude') as string;
    const longitude = formData.get('longitude') as string;
    const imageFile = formData.get('image') as File | null;

    // Validate required fields
    if (!message || !receiver || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let imagePath = null;
    let imageUrl = null;

    // Process image if present
    if (imageFile && imageFile.size > 0) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      imagePath = `images/${fileName}`;
      
      // Convert File to ArrayBuffer
      const fileBuffer = await imageFile.arrayBuffer();

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(imagePath, fileBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: imageFile.type,
        });

      if (uploadError) {
        console.error('Image upload error:', uploadError);
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        );
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(imagePath);

      imageUrl = urlData.publicUrl;
    }

    // Insert message into database
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          message,
          receiver,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          time: new Date().toISOString(),
          image_path: imagePath,
          image_url: imageUrl,
          has_image: !!imageFile,
        },
      ])
      .select();

    if (error) {
      // Clean up uploaded image if database insert fails
      if (imagePath) {
        await supabase.storage.from('images').remove([imagePath]);
      }
      console.error('Database insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}