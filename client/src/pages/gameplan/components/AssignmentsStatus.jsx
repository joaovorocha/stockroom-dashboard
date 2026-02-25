/**
 * AssignmentsStatus - Shows Fitting Room assignments and Closing Duties status
 * Used in SA and Management views
 */
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import client from '../../../api/client'

const AssignmentsStatus = ({ assignments = {}, employees = {} }) => {
  const [closingDuties, setClosingDuties] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClosingDuties()
  }, [])

  const fetchClosingDuties = async () => {
    try {
      const res = await client.get('/closing-duties')
      setClosingDuties(res.data?.duties || [])
    } catch (e) {
      // Ignore errors - closing duties might not exist
    } finally {
      setLoading(false)
    }
  }

  // Build fitting room assignments list
  const buildFittingRoomList = () => {
    const rooms = []
    const allEmployees = [
      ...(employees.SA || []),
      ...(employees.BOH || []),
      ...(employees.MANAGEMENT || []),
      ...(employees.TAILOR || [])
    ]

    // Get all unique fitting rooms from assignments
    Object.entries(assignments).forEach(([empId, assignment]) => {
      const fr = assignment.fittingRoom || assignment.fitting_room
      if (fr) {
        const emp = allEmployees.find(e => 
          String(e.id) === String(empId) || 
          String(e.employee_id) === String(empId)
        )
        rooms.push({
          room: fr,
          employeeName: emp?.name || emp?.full_name || 'Unknown',
          available: false
        })
      }
    })

    // Add common fitting room names that might be available
    const commonRooms = ['BC - Guy', 'BC - Treo', 'Hosp 1', 'Hosp 2', 'Hosp 3', 'Hallway 1', 'Hallway 2', 'Hallway 3', 'Hallway 4', 'MTM 1', 'MTM 2', 'POPUP 1', 'POPUP 2']
    commonRooms.forEach(room => {
      if (!rooms.find(r => r.room === room)) {
        rooms.push({ room, employeeName: null, available: true })
      }
    })

    return rooms.sort((a, b) => a.room.localeCompare(b.room))
  }

  // Calculate closing duties completion
  const getClosingDutiesCompletion = () => {
    if (!closingDuties.length) return { completed: 0, total: 0, percent: 0 }
    const completed = closingDuties.filter(d => d.completed || d.status === 'completed').length
    return {
      completed,
      total: closingDuties.length,
      percent: Math.round((completed / closingDuties.length) * 100)
    }
  }

  const fittingRooms = buildFittingRoomList()
  const dutiesStatus = getClosingDutiesCompletion()

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      marginBottom: '20px'
    }}>
      {/* Fitting Room Assignments */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '16px'
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>
          Fitting Room Assignments
        </h3>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {fittingRooms.slice(0, 12).map((room, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: room.available ? '#f0fdf4' : 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px'
              }}
            >
              <span style={{ fontWeight: 500, fontSize: '13px' }}>{room.room}</span>
              {room.available ? (
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: '#22c55e',
                  color: 'white'
                }}>Available</span>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {room.employeeName}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Closing Duties Status */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '16px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            Closing Duties Status
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link to="/closing-duties" className="btn btn-sm btn-outline">
              Open Closing Duties
            </Link>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {dutiesStatus.percent}%
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        ) : closingDuties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
            No closing duties configured
          </div>
        ) : (
          <div style={{ 
            maxHeight: '300px', 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {closingDuties.slice(0, 12).map((duty, index) => {
              const isCompleted = duty.completed || duty.status === 'completed'
              return (
                <div 
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{ fontSize: '13px' }}>{duty.name || duty.title}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: isCompleted ? '#22c55e' : '#f59e0b',
                      color: 'white'
                    }}>
                      {isCompleted ? 'Done' : 'Pending'}
                    </span>
                    {!isCompleted && (
                      <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }}>
                        Open
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default AssignmentsStatus
