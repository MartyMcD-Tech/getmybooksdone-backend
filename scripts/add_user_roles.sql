-- Add user roles and permissions system

-- Create roles enum
CREATE TYPE user_role AS ENUM ('client', 'adviser', 'administrator');

-- Add role column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'client',
ADD COLUMN IF NOT EXISTS adviser_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_adviser_id ON profiles(adviser_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active);

-- Create client-adviser relationships table
CREATE TABLE IF NOT EXISTS client_adviser_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  adviser_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  UNIQUE(client_id, adviser_id)
);

-- Create audit log table for tracking actions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- 'upload', 'transaction', 'user', etc.
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  performed_by UUID REFERENCES profiles(id), -- Who performed the action (for admin actions)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Create permissions view
CREATE OR REPLACE VIEW user_permissions AS
SELECT 
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.role,
  p.adviser_id,
  p.is_active,
  p.permissions,
  adviser.first_name as adviser_first_name,
  adviser.last_name as adviser_last_name,
  adviser.email as adviser_email,
  -- Calculate effective permissions
  CASE 
    WHEN p.role = 'administrator' THEN jsonb_build_object(
      'can_view_all_users', true,
      'can_delete_uploads', true,
      'can_manage_users', true,
      'can_view_audit_log', true,
      'can_assign_advisers', true,
      'can_view_trial_balance', true,
      'can_export_data', true
    )
    WHEN p.role = 'adviser' THEN jsonb_build_object(
      'can_view_assigned_clients', true,
      'can_view_client_data', true,
      'can_code_transactions', true,
      'can_view_trial_balance', true,
      'can_export_client_data', true,
      'can_delete_client_uploads', true
    )
    ELSE jsonb_build_object(
      'can_view_own_data', true,
      'can_upload_files', true,
      'can_view_own_transactions', true
    )
  END as effective_permissions
FROM profiles p
LEFT JOIN profiles adviser ON p.adviser_id = adviser.id
WHERE p.is_active = true;

-- Function to check if user can access another user's data
CREATE OR REPLACE FUNCTION can_access_user_data(accessor_id UUID, target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  accessor_role user_role;
  is_assigned_client BOOLEAN := false;
BEGIN
  -- Get accessor's role
  SELECT role INTO accessor_role FROM profiles WHERE id = accessor_id;
  
  -- Administrators can access anyone
  IF accessor_role = 'administrator' THEN
    RETURN true;
  END IF;
  
  -- Users can always access their own data
  IF accessor_id = target_user_id THEN
    RETURN true;
  END IF;
  
  -- Advisers can access their assigned clients
  IF accessor_role = 'adviser' THEN
    SELECT EXISTS(
      SELECT 1 FROM client_adviser_relationships 
      WHERE adviser_id = accessor_id 
      AND client_id = target_user_id 
      AND is_active = true
    ) INTO is_assigned_client;
    
    RETURN is_assigned_client;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id UUID,
  p_action VARCHAR(100),
  p_resource_type VARCHAR(50),
  p_resource_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO audit_log (
    user_id, action, resource_type, resource_id, details, performed_by
  ) VALUES (
    p_user_id, p_action, p_resource_type, p_resource_id, p_details, p_performed_by
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create some default administrator and adviser accounts
-- Note: These will need to be created through the application with proper auth

-- Grant permissions
GRANT SELECT ON user_permissions TO authenticated;
GRANT SELECT ON client_adviser_relationships TO authenticated;
GRANT SELECT ON audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_user_data(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit_event(UUID, VARCHAR, VARCHAR, UUID, JSONB, UUID) TO authenticated;

-- Show current user roles
SELECT 'User roles added' as status, COUNT(*) as total_users FROM profiles;
