// API Client for Python Backend Integration
// Handles authentication, token management, and API requests

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.tokenKey = 'aisensei_access_token';
    this.refreshTokenKey = 'aisensei_refresh_token';
    this.userKey = 'aisensei_user';
  }

  // Token Management
  getAccessToken() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.tokenKey);
    }
    return null;
  }

  getRefreshToken() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.refreshTokenKey);
    }
    return null;
  }

  setTokens(accessToken, refreshToken) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, accessToken);
      if (refreshToken) {
        localStorage.setItem(this.refreshTokenKey, refreshToken);
      }
    }
  }

  clearTokens() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshTokenKey);
      localStorage.removeItem(this.userKey);
    }
  }

  // User Management
  setUser(user) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.userKey, JSON.stringify(user));
    }
  }

  getUser() {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem(this.userKey);
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  }

  // Request Configuration
  getHeaders(includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  // HTTP Methods
  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    
    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...this.getHeaders(options.includeAuth !== false),
          ...options.headers,
        },
      });

      // Handle 401 Unauthorized - Token expired
      if (response.status === 401 && options.includeAuth !== false) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the request with new token
          return this.request(url, options);
        } else {
          // Redirect to login
          this.clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          throw new Error('Authentication failed');
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  // File Upload
  async uploadFile(url, formData, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    const token = this.getAccessToken();
    
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: formData,
        ...options,
      });

      if (response.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.uploadFile(url, formData, options);
        } else {
          this.clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          throw new Error('Authentication failed');
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Upload failed');
      }

      return data;
    } catch (error) {
      console.error('File Upload Error:', error);
      throw error;
    }
  }

  // Authentication Methods
  async login(email, password) {
    try {
      const response = await this.post('/api/v1/auth/login', {
        email: email,
        password: password,
      }, { includeAuth: false });

      if (response.access_token) {
        this.setTokens(response.access_token, response.refresh_token);
        
        // Fetch user info
        const user = await this.getCurrentUser();
        this.setUser(user);
        
        return { success: true, user };
      }

      throw new Error('Invalid response from server');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async register(userData) {
    try {
      const response = await this.post('/api/v1/auth/register', userData, { includeAuth: false });
      
      if (response.access_token) {
        this.setTokens(response.access_token, response.refresh_token);
        
        // Fetch user info
        const user = await this.getCurrentUser();
        this.setUser(user);
        
        return { success: true, user };
      }

      return { success: true, message: 'Registration successful. Please login.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout() {
    try {
      await this.post('/api/v1/auth/logout', {});
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  async refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await this.post('/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      }, { includeAuth: false });

      if (response.access_token) {
        this.setTokens(response.access_token, response.refresh_token);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    return false;
  }

  async getCurrentUser() {
    return this.get('/api/v1/auth/me');
  }

  // Google OAuth
  loginWithGoogle() {
    if (typeof window !== 'undefined') {
      const oauthUrl = `${this.baseURL}/api/v1/auth/login/google`;
      console.log('Google OAuth: Redirecting to', oauthUrl);
      console.log('Current base URL:', this.baseURL);
      window.location.href = oauthUrl;
    } else {
      console.error('Google OAuth: Window object not available');
    }
  }

  // API Methods for Application Features
  async getTeachers() {
    return this.get('/api/v1/teachers');
  }

  async getClassrooms() {
    return this.get('/api/v1/classrooms');
  }

  async createClassroom(data) {
    return this.post('/api/v1/classrooms', data);
  }

  async syncClassroom(classroomId) {
    return this.post(`/api/v1/classrooms/${classroomId}/sync`, {});
  }

  async getAssignments(classroomId) {
    return this.get(`/api/v1/classrooms/${classroomId}/assignments`);
  }

  async createAssignment(data) {
    return this.post('/api/v1/assignments', data);
  }

  async getSubmissions(assignmentId) {
    return this.get(`/api/v1/assignments/${assignmentId}/submissions`);
  }

  async createSubmission(assignmentId, formData) {
    return this.uploadFile(`/api/v1/submissions?assignment_id=${assignmentId}`, formData);
  }

  async gradeSubmission(submissionId, gradingData) {
    return this.post(`/api/v1/submissions/${submissionId}/grade`, gradingData);
  }

  async getGradingModels() {
    return this.get('/api/v1/grading/models');
  }

  // Legacy API compatibility methods
  async addStudent(studentData) {
    // Map to new classroom/student structure
    const classroomData = {
      name: `Class for ${studentData.name}`,
      students: [studentData]
    };
    return this.createClassroom(classroomData);
  }

  async getStudentList() {
    // Get all students from all classrooms
    const classrooms = await this.getClassrooms();
    const students = [];
    
    for (const classroom of classrooms) {
      const classroomDetails = await this.get(`/api/v1/classrooms/${classroom.id}`);
      students.push(...(classroomDetails.students || []));
    }
    
    return students;
  }

  async evaluateStudent(studentId, evaluationData) {
    // Create assignment and submission for evaluation
    const assignment = await this.createAssignment({
      title: evaluationData.topic || 'Evaluation',
      classroom_id: evaluationData.classroom_id,
      questions: evaluationData.questions,
    });

    const formData = new FormData();
    if (evaluationData.text) {
      formData.append('text_response', evaluationData.text);
    }
    if (evaluationData.images) {
      evaluationData.images.forEach((image, index) => {
        formData.append('files', image);
      });
    }

    const submission = await this.createSubmission(assignment.id, formData);
    
    // Grade the submission
    return this.gradeSubmission(submission.id, {
      model: evaluationData.model || 'gpt-4',
      grading_criteria: evaluationData.criteria,
    });
  }

  async getStudentFeedbacks(studentId) {
    // Get all submissions for a student
    const classrooms = await this.getClassrooms();
    const feedbacks = [];
    
    for (const classroom of classrooms) {
      const assignments = await this.getAssignments(classroom.id);
      for (const assignment of assignments) {
        const submissions = await this.getSubmissions(assignment.id);
        const studentSubmissions = submissions.filter(s => s.student_id === studentId);
        feedbacks.push(...studentSubmissions);
      }
    }
    
    return feedbacks;
  }
}

// Create singleton instance
const apiClient = new ApiClient();

export default apiClient;