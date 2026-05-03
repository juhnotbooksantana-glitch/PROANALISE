
/**
 * Standalone Storage Utility
 * Provides localStorage fallbacks for Firestore operations when Firebase is declined.
 */

export const standaloneStorage = {
  get: (key: string, defaultValue: any = null) => {
    const data = localStorage.getItem(`quantum_zeuz_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  },
  
  set: (key: string, value: any) => {
    localStorage.setItem(`quantum_zeuz_${key}`, JSON.stringify(value));
  },

  // Mock authorized users
  getAuthorizedUsers: () => {
    return standaloneStorage.get('authorized_users', []);
  },

  addAuthorizedUser: (user: any) => {
    const users = standaloneStorage.getAuthorizedUsers();
    const existing = users.findIndex((u: any) => u.email === user.email);
    if (existing >= 0) {
      users[existing] = user;
    } else {
      users.push(user);
    }
    standaloneStorage.set('authorized_users', users);
  },

  removeAuthorizedUser: (email: string) => {
    const users = standaloneStorage.getAuthorizedUsers();
    standaloneStorage.set('authorized_users', users.filter((u: any) => u.email !== email));
  },

  // Mock feedbacks/bias
  getFeedbacks: (userId?: string) => {
    const all = standaloneStorage.get('feedbacks', []);
    if (userId) {
      return all.filter((f: any) => f.userId === userId);
    }
    return all;
  },

  addFeedback: (feedback: any) => {
    const all = standaloneStorage.get('feedbacks', []);
    all.unshift({
      id: Math.random().toString(36).substr(2, 9),
      ...feedback,
      timestamp: { toDate: () => new Date() } // Mock Timestamp
    });
    standaloneStorage.set('feedbacks', all.slice(0, 500)); // Limit to last 500
  }
};
