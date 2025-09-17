#!/usr/bin/env node

import fs from 'fs';
import FormDataClass from 'form-data';
import fetch from 'node-fetch';

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_USER = {
  username: 'testuser',
  password: 'testpass123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User'
};

// Cookie jar to maintain session
let sessionCookie = null;

async function makeRequest(method, endpoint, data = null, formData = null) {
  
  const options = {
    method,
    headers: {
      ...(sessionCookie ? { 'Cookie': sessionCookie } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    ...(formData ? { body: formData } : {}),
  };

  // Remove content-type for FormData to let node set boundary
  if (formData) {
    delete options.headers['Content-Type'];
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  
  // Capture session cookie from login
  if (response.headers.get('set-cookie')) {
    sessionCookie = response.headers.get('set-cookie').split(';')[0];
  }
  
  return response;
}

async function registerOrLogin() {
  console.log('🔐 Testing authentication...');
  
  try {
    // Try to register
    const registerResponse = await makeRequest('POST', '/api/auth/register', TEST_USER);
    if (registerResponse.ok) {
      console.log('✅ User registered successfully');
      return true;
    }
  } catch (error) {
    console.log('ℹ️  Registration failed (user may already exist), trying login...');
  }
  
  // Try to login
  try {
    const loginResponse = await makeRequest('POST', '/api/auth/login', {
      username: TEST_USER.username,
      password: TEST_USER.password
    });
    
    if (loginResponse.ok) {
      console.log('✅ User logged in successfully');
      return true;
    } else {
      console.log('❌ Login failed:', await loginResponse.text());
      return false;
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
    return false;
  }
}

async function testFileUpload() {
  console.log('📄 Testing file upload with fixed field names...');
  
  try {
    // Create FormData with the correct field name
    const formData = new FormDataClass();
    
    // Use the correct field name 'files' (the fix that was applied)
    formData.append('files', fs.createReadStream('test_recurring_tasks.txt'));
    
    console.log('📤 Uploading file with field name "files"...');
    
    const uploadResponse = await makeRequest('POST', '/api/recurring-tasks/extract', null, formData);
    
    if (uploadResponse.ok) {
      const result = await uploadResponse.json();
      console.log('✅ File upload successful!');
      console.log('📋 Extracted tasks:', result.tasks?.length || 0);
      
      if (result.tasks && result.tasks.length > 0) {
        console.log('🎯 Sample extracted task:', {
          name: result.tasks[0].name || result.tasks[0].taskName,
          type: result.tasks[0].type || result.tasks[0].taskType,
          timeBlock: result.tasks[0].timeBlock
        });
      }
      
      return true;
    } else {
      const errorText = await uploadResponse.text();
      console.log('❌ Upload failed:', uploadResponse.status, errorText);
      
      // Check specifically for the multer error that was fixed
      if (errorText.includes('MulterError: Unexpected field')) {
        console.log('🔴 CRITICAL: MulterError still occurring! Field name fix did not work.');
        return false;
      } else if (errorText.includes('Unauthorized')) {
        console.log('🔓 Authentication issue detected');
        return false;
      } else {
        console.log('⚠️  Upload failed with different error (not field name issue)');
        return false;
      }
    }
  } catch (error) {
    console.log('❌ Upload test error:', error.message);
    return false;
  }
}

async function verifyUserContext() {
  console.log('👤 Verifying user context...');
  
  try {
    const userResponse = await makeRequest('GET', '/api/user');
    if (userResponse.ok) {
      const user = await userResponse.json();
      console.log('✅ User context verified:', user.username);
      return true;
    } else {
      console.log('❌ User context failed:', await userResponse.text());
      return false;
    }
  } catch (error) {
    console.log('❌ User context error:', error.message);
    return false;
  }
}

async function runTest() {
  console.log('🧪 Starting AI Recurring Assistant Upload Fix Test');
  console.log('=' * 50);
  
  // Check if test file exists
  if (!fs.existsSync('test_recurring_tasks.txt')) {
    console.log('❌ Test file not found: test_recurring_tasks.txt');
    process.exit(1);
  }
  
  // Step 1: Authenticate
  const authSuccess = await registerOrLogin();
  if (!authSuccess) {
    console.log('❌ Test failed at authentication step');
    process.exit(1);
  }
  
  // Step 2: Verify user context
  const contextSuccess = await verifyUserContext();
  if (!contextSuccess) {
    console.log('❌ Test failed at user context verification');
    process.exit(1);
  }
  
  // Step 3: Test file upload
  const uploadSuccess = await testFileUpload();
  
  console.log('\n' + '=' * 50);
  if (uploadSuccess) {
    console.log('🎉 TEST PASSED: File upload fix working correctly!');
    console.log('✅ No MulterError: Unexpected field errors detected');
    console.log('✅ Field name fix successfully resolved the issue');
  } else {
    console.log('❌ TEST FAILED: Upload issues still present');
  }
  
  process.exit(uploadSuccess ? 0 : 1);
}

// Run the test
runTest().catch(console.error);