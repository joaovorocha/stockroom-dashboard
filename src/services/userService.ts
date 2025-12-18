// userService.ts

import { User } from '../models/user';
import { hashPassword, initializeDefaultUsers, getAllUsers, USERS_STORAGE_KEY } from '../utils/userUtils';

export const validateCredentials = async (email: string, password: string): Promise<User | null> => {
  await initializeDefaultUsers();
  
  const users = getAllUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    console.log('User not found:', email);
    return null;
  }
  
  // Check if user is active
  if (user.status !== 'active') {
    console.log('User is not active:', email, user.status);
    return null;
  }
  
  // For default users that might have plain text passwords from older storage
  if (user.password === password) {
    return user;
  }
  
  // Check hashed password
  const hashedInput = hashPassword(password);
  if (user.password === hashedInput) {
    return user;
  }
  
  console.log('Password mismatch for user:', email);
  return null;
};

export const createUser = (userData: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): User => {
  const users = getAllUsers();
  
  // Check if email already exists
  if (users.some(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
    throw new Error('A user with this email already exists');
  }
  
  const newUser: User = {
    ...userData,
    id: `user_${Date.now()}`,
    createdAt: new Date().toISOString(),
    lastLogin: undefined,
    status: userData.status || 'active', // Ensure status is set
    isManager: userData.isManager || false, // Ensure isManager is set
    password: hashPassword(userData.password), // Hash the password
  };
  
  users.push(newUser);
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  
  console.log('User created:', newUser.email, 'Status:', newUser.status, 'IsManager:', newUser.isManager);
  
  return newUser;
};

export const updateUserLastLogin = (userId: string): void => {
  const users = getAllUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    users[userIndex].lastLogin = new Date().toISOString();
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }
};