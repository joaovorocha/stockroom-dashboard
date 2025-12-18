import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, validateCredentials, updateUserLastLogin } from '../utils'; // Adjust the import based on your project structure

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for stored user session
    const checkAuth = async () => {
      try {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          // Verify user still exists and is active
          const users = JSON.parse(localStorage.getItem('users') || '[]');
          const validUser = users.find((u: User) => u.id === parsedUser.id && u.status === 'active');
          if (validUser) {
            setUser(parsedUser);
          } else {
            localStorage.removeItem('currentUser');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('currentUser');
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const validatedUser = await validateCredentials(email, password);
      
      if (validatedUser) {
        // Update last login
        updateUserLastLogin(validatedUser.id);
        setUser(validatedUser);
        localStorage.setItem('currentUser', JSON.stringify(validatedUser));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};