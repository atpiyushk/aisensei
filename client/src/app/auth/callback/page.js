"use client";
import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import apiClient from "@/lib/api-client";

function AuthCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const hasProcessed = useRef(false);

    useEffect(() => {
        // Prevent double processing
        if (hasProcessed.current) return;
        
        const handleCallback = async () => {
            try {
                const accessToken = searchParams.get('access_token');
                const refreshToken = searchParams.get('refresh_token');
                const error = searchParams.get('error');

                if (error) {
                    console.error('OAuth error:', error);
                    router.push('/login?error=oauth_failed');
                    return;
                }

                if (accessToken && refreshToken) {
                    // Mark as processed to prevent re-runs
                    hasProcessed.current = true;
                    
                    // Store tokens using apiClient
                    apiClient.setTokens(accessToken, refreshToken);
                    
                    // Fetch user info
                    try {
                        const user = await apiClient.getCurrentUser();
                        apiClient.setUser(user);
                    } catch (error) {
                        console.error('Failed to fetch user info:', error);
                    }
                    
                    // Redirect to dashboard
                    router.push('/dashboard');
                } else {
                    console.error('No tokens received from OAuth callback');
                    router.push('/login?error=oauth_failed');
                }
            } catch (error) {
                console.error('Auth callback error:', error);
                router.push('/login?error=oauth_failed');
            }
        };

        handleCallback();
    }, [searchParams, router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Completing sign in...
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Please wait while we sign you in with Google.
                </p>
            </div>
        </div>
    );
}

// Loading fallback component
function AuthCallbackLoading() {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Loading...
                </h2>
            </div>
        </div>
    );
}

export default function AuthCallback() {
    return (
        <Suspense fallback={<AuthCallbackLoading />}>
            <AuthCallbackContent />
        </Suspense>
    );
}
