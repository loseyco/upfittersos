import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    onIdTokenChanged,
    signInWithPopup,
    signOut as firebaseSignOut
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthContextType {
    currentUser: User | null;
    tenantId: string | null;
    role: string | null;
    roles: string[];
    simulatedRole: string | null;
    loading: boolean;
    signInWithGoogle: () => Promise<import('firebase/auth').UserCredential>;
    logout: () => Promise<void>;
    startSimulation: (roleKey: string) => void;
    endSimulation: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [roles, setRoles] = useState<string[]>([]);
    const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            if (user) {
                try {
                    const token = await user.getIdTokenResult();
                    setTenantId(token.claims.tenantId as string || null);
                    setRole(token.claims.role as string || null);
                    setRoles(token.claims.roles as string[] || (token.claims.role ? [token.claims.role as string] : []));
                } catch (e) {
                    console.error("Token fetch error", e);
                }
            } else {
                setTenantId(null);
                setRole(null);
                setRoles([]);
                setSimulatedRole(null);
            }
            setCurrentUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signInWithGoogle = async () => {
        try {
            return await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Error signing in with Google", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
            throw error;
        }
    };

    const startSimulation = (roleKey: string) => {
        setSimulatedRole(roleKey);
    };

    const endSimulation = () => {
        setSimulatedRole(null);
    };

    const value = {
        currentUser,
        tenantId,
        role,
        roles,
        simulatedRole,
        loading,
        signInWithGoogle,
        logout,
        startSimulation,
        endSimulation
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
