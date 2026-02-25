/**
 * Gameplan Index - Auto-detects user role and shows appropriate view
 * 
 * Routes based on user.employeeType:
 * - MANAGEMENT → GameplanManagement (full features)
 * - SA → GameplanSA (sales focus, fitting rooms, closing duties)
 * - BOH → GameplanBOH (operations focus, inventory)
 * - TAILOR → GameplanTailor (alterations focus)
 */
import React, { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import GameplanManagement from './GameplanManagement'
import GameplanSA from './GameplanSA'
import GameplanBOH from './GameplanBOH'
import GameplanCalendar from './GameplanCalendar'
import GameplanEdit from './GameplanEdit'

const GameplanIndex = () => {
  const { user, isManager } = useAuth()
  const [view, setView] = useState('dashboard') // dashboard | calendar | edit
  const [selectedDate, setSelectedDate] = useState(null)

  // Determine employee type from user
  const employeeType = user?.employeeType || user?.employee_type || user?.type || 'SA'

  // Can user access calendar/edit?
  const canEdit = isManager || user?.canEditGameplan || user?.can_edit_gameplan

  // Handle navigation to calendar
  const handleOpenCalendar = () => {
    setView('calendar')
  }

  // Handle navigation to edit
  const handleOpenEdit = (date = null) => {
    setSelectedDate(date || new Date().toISOString().split('T')[0])
    setView('edit')
  }

  // Handle back to dashboard
  const handleBack = () => {
    setView('dashboard')
    setSelectedDate(null)
  }

  // Render calendar view (managers only)
  if (view === 'calendar' && canEdit) {
    return (
      <GameplanCalendar 
        onBack={handleBack}
        onEditDate={handleOpenEdit}
      />
    )
  }

  // Render edit view (managers only)
  if (view === 'edit' && canEdit) {
    return (
      <GameplanEdit 
        date={selectedDate}
        onBack={handleBack}
        onOpenCalendar={handleOpenCalendar}
      />
    )
  }

  // Render role-specific dashboard
  const dashboardProps = {
    onOpenCalendar: canEdit ? handleOpenCalendar : null,
    onOpenEdit: canEdit ? handleOpenEdit : null,
  }

  // Route to appropriate view based on employee type
  const type = (employeeType || '').toUpperCase()

  if (type === 'MANAGEMENT' || type === 'MANAGER' || isManager) {
    return <GameplanManagement {...dashboardProps} />
  }

  if (type === 'BOH' || type === 'BACK OF HOUSE') {
    return <GameplanBOH {...dashboardProps} />
  }

  // Default to SA view (includes tailors for now)
  return <GameplanSA {...dashboardProps} />
}

export default GameplanIndex
