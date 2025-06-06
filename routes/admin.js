const express = require("express")
const { createClient } = require("@supabase/supabase-js")

const router = express.Router()

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Middleware to check if user has admin/adviser permissions
const requireRole = (minRole) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id

      // Get user's role from profiles
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", userId)
        .single()

      if (error || !profile) {
        return res.status(403).json({ error: "Access denied - profile not found" })
      }

      if (!profile.is_active) {
        return res.status(403).json({ error: "Account is inactive" })
      }

      const roleHierarchy = { client: 1, adviser: 2, administrator: 3 }
      const userLevel = roleHierarchy[profile.role] || 0
      const requiredLevel = roleHierarchy[minRole] || 999

      if (userLevel < requiredLevel) {
        return res.status(403).json({ error: "Insufficient permissions" })
      }

      req.userRole = profile.role
      next()
    } catch (error) {
      console.error("Role check error:", error)
      res.status(500).json({ error: "Permission check failed" })
    }
  }
}

// Get users (filtered by role)
router.get("/users", requireRole("adviser"), async (req, res) => {
  try {
    const userId = req.user.id
    const userRole = req.userRole

    let query = supabase.from("user_permissions").select("*")

    if (userRole === "adviser") {
      // Advisers can only see their assigned clients
      query = query.or(`adviser_id.eq.${userId},id.eq.${userId}`)
    }
    // Administrators can see all users (no additional filter)

    const { data: users, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching users:", error)
      return res.status(500).json({ error: "Failed to fetch users" })
    }

    res.json({ users })
  } catch (error) {
    console.error("Error in users route:", error)
    res.status(500).json({ error: "Failed to fetch users" })
  }
})

// Get user details
router.get("/users/:userId/details", requireRole("adviser"), async (req, res) => {
  try {
    const { userId } = req.params
    const requesterId = req.user.id
    const requesterRole = req.userRole

    // Check if requester can access this user's data
    const { data: canAccess } = await supabase.rpc("can_access_user_data", {
      accessor_id: requesterId,
      target_user_id: userId,
    })

    if (!canAccess) {
      return res.status(403).json({ error: "Access denied to this user's data" })
    }

    // Get user profile
    const { data: user, error: userError } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("id", userId)
      .single()

    if (userError) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get user's uploads
    const { data: uploads, error: uploadsError } = await supabase
      .from("uploads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)

    // Get user's transaction count
    const { count: transactionCount, error: transactionError } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)

    // Get last activity
    const { data: lastActivity } = await supabase
      .from("uploads")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const stats = {
      uploadCount: uploads?.length || 0,
      transactionCount: transactionCount || 0,
      lastActivity: lastActivity?.created_at || null,
    }

    res.json({
      user,
      uploads: uploads || [],
      stats,
    })
  } catch (error) {
    console.error("Error fetching user details:", error)
    res.status(500).json({ error: "Failed to fetch user details" })
  }
})

// Delete user's uploads
router.delete("/users/:userId/uploads", requireRole("adviser"), async (req, res) => {
  try {
    const { userId } = req.params
    const requesterId = req.user.id
    const requesterRole = req.userRole

    // Check if requester can access this user's data
    const { data: canAccess } = await supabase.rpc("can_access_user_data", {
      accessor_id: requesterId,
      target_user_id: userId,
    })

    if (!canAccess) {
      return res.status(403).json({ error: "Access denied to this user's data" })
    }

    // Get uploads to delete
    const { data: uploads, error: fetchError } = await supabase.from("uploads").select("id").eq("user_id", userId)

    if (fetchError) {
      return res.status(500).json({ error: "Failed to fetch uploads" })
    }

    if (!uploads || uploads.length === 0) {
      return res.json({ message: "No uploads found", deletedCount: 0 })
    }

    const uploadIds = uploads.map((upload) => upload.id)

    // Delete transactions first (foreign key constraint)
    const { error: transactionError } = await supabase.from("transactions").delete().in("upload_id", uploadIds)

    if (transactionError) {
      console.error("Error deleting transactions:", transactionError)
      return res.status(500).json({ error: "Failed to delete transactions" })
    }

    // Delete uploads
    const { error: uploadError } = await supabase.from("uploads").delete().eq("user_id", userId)

    if (uploadError) {
      console.error("Error deleting uploads:", uploadError)
      return res.status(500).json({ error: "Failed to delete uploads" })
    }

    // Log the action
    await supabase.rpc("log_audit_event", {
      p_user_id: userId,
      p_action: "DELETE_ALL_UPLOADS",
      p_resource_type: "upload",
      p_details: { deletedCount: uploads.length },
      p_performed_by: requesterId,
    })

    res.json({
      message: "Successfully deleted all uploads",
      deletedCount: uploads.length,
    })
  } catch (error) {
    console.error("Error deleting uploads:", error)
    res.status(500).json({ error: "Failed to delete uploads" })
  }
})

// Update user status (admin only)
router.put("/users/:userId/status", requireRole("administrator"), async (req, res) => {
  try {
    const { userId } = req.params
    const { is_active } = req.body
    const requesterId = req.user.id

    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single()

    if (error) {
      console.error("Error updating user status:", error)
      return res.status(500).json({ error: "Failed to update user status" })
    }

    // Log the action
    await supabase.rpc("log_audit_event", {
      p_user_id: userId,
      p_action: is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      p_resource_type: "user",
      p_details: { is_active },
      p_performed_by: requesterId,
    })

    res.json({ user: data })
  } catch (error) {
    console.error("Error updating user status:", error)
    res.status(500).json({ error: "Failed to update user status" })
  }
})

// Get audit log (admin only)
router.get("/audit-log", requireRole("administrator"), async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query

    const { data: entries, error } = await supabase
      .from("audit_log")
      .select(
        `
        *,
        user:profiles!audit_log_user_id_fkey(email),
        performed_by_user:profiles!audit_log_performed_by_fkey(email)
      `,
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching audit log:", error)
      return res.status(500).json({ error: "Failed to fetch audit log" })
    }

    // Format the response
    const formattedEntries = entries.map((entry) => ({
      ...entry,
      user_email: entry.user?.email,
      performed_by_email: entry.performed_by_user?.email,
    }))

    res.json({ entries: formattedEntries })
  } catch (error) {
    console.error("Error fetching audit log:", error)
    res.status(500).json({ error: "Failed to fetch audit log" })
  }
})

// Assign adviser to client (admin only)
router.post("/users/:clientId/assign-adviser", requireRole("administrator"), async (req, res) => {
  try {
    const { clientId } = req.params
    const { adviserId } = req.body
    const requesterId = req.user.id

    // Verify the adviser exists and has the right role
    const { data: adviser, error: adviserError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", adviserId)
      .eq("role", "adviser")
      .single()

    if (adviserError || !adviser) {
      return res.status(400).json({ error: "Invalid adviser ID" })
    }

    // Update client's adviser_id
    const { error: updateError } = await supabase.from("profiles").update({ adviser_id: adviserId }).eq("id", clientId)

    if (updateError) {
      return res.status(500).json({ error: "Failed to assign adviser" })
    }

    // Create relationship record
    const { error: relationshipError } = await supabase.from("client_adviser_relationships").insert({
      client_id: clientId,
      adviser_id: adviserId,
      assigned_by: requesterId,
    })

    if (relationshipError) {
      console.error("Error creating relationship:", relationshipError)
      // Continue anyway, the main assignment worked
    }

    // Log the action
    await supabase.rpc("log_audit_event", {
      p_user_id: clientId,
      p_action: "ASSIGN_ADVISER",
      p_resource_type: "user",
      p_details: { adviser_id: adviserId },
      p_performed_by: requesterId,
    })

    res.json({ message: "Adviser assigned successfully" })
  } catch (error) {
    console.error("Error assigning adviser:", error)
    res.status(500).json({ error: "Failed to assign adviser" })
  }
})

module.exports = router
