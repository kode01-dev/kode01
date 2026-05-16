import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        // Dynamic params
        const title = searchParams.get('title') || 'kode01.Marketplace';
        const description = searchParams.get('desc') || 'The premium digital asset marketplace';
        const price = searchParams.get('price');

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#0a0a0f', // Noir Profond
                        backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.05) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255,255,255,0.05) 2%, transparent 0%)',
                        backgroundSize: '100px 100px',
                        fontFamily: 'Inter, sans-serif',
                    }}
                >
                    {/* Subtle Glows */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '-20%',
                            left: '-10%',
                            width: '800px',
                            height: '800px',
                            background: 'radial-gradient(circle, rgba(242,145,200,0.15) 0%, transparent 60%)', // kode01 Pink
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '-20%',
                            right: '-10%',
                            width: '800px',
                            height: '800px',
                            background: 'radial-gradient(circle, rgba(148,168,184,0.15) 0%, transparent 60%)', // kode01 Blue
                        }}
                    />

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(20,20,25,0.8)', // Noir Carte
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '40px',
                            padding: '60px 80px',
                            boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
                            maxWidth: '85%',
                            textAlign: 'center',
                        }}
                    >
                        {/* Logo area */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '15px',
                                marginBottom: '40px',
                            }}
                        >
                            <div
                                style={{
                                    color: 'white',
                                    fontSize: 42,
                                    fontWeight: 800,
                                    letterSpacing: '-2px',
                                }}
                            >
                                kode01
                            </div>
                        </div>

                        <h1
                            style={{
                                fontSize: 64,
                                fontWeight: 900,
                                color: 'white',
                                lineHeight: 1.1,
                                marginBottom: '20px',
                                letterSpacing: '-1px',
                            }}
                        >
                            {title}
                        </h1>

                        <p
                            style={{
                                fontSize: 32,
                                color: 'rgba(255,255,255,0.6)',
                                fontWeight: 500,
                                marginBottom: price ? '40px' : '0',
                                lineHeight: 1.4,
                            }}
                        >
                            {description}
                        </p>

                        {price && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'rgba(242,145,200,0.1)',
                                    border: '1px solid rgba(242,145,200,0.3)',
                                    padding: '12px 30px',
                                    borderRadius: '100px',
                                    color: '#F291C8',
                                    fontSize: 36,
                                    fontWeight: 800,
                                }}
                            >
                                {price}
                            </div>
                        )}
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (e: unknown) {
        console.log(`${e instanceof Error ? e.message : String(e)}`);
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}
