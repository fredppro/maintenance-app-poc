import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Notification request received:', body)
    
    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.json({ 
      success: true, 
      message: 'Notification sent successfully',
      recipient: body.worker?.email 
    })
  } catch (error) {
    console.error('Error in notify API:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
