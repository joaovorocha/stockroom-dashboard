/**
 * UpcomingPlans - Widget showing next 3 days of game plans
 * Managers can see status and edit upcoming plans
 */
import React, { useState, useEffect } from 'react'
import client from '../../../api/client'

const UpcomingPlans = ({ onEditDate, maxDays = 3 }) => {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUpcomingPlans()
  }, [])

  const fetchUpcomingPlans = async () => {
    try {
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1

      const res = await client.get(`/gameplan/calendar/${year}/${month}`)
      const data = res.data

      // Get next N days from today
      const upcoming = []
      for (let i = 0; i <= maxDays; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        
        const plan = data.plans?.[dateStr]
        upcoming.push({
          date: dateStr,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          published: plan?.published || false,
          locked: plan?.locked || false,
          exists: !!plan
        })
      }

      setPlans(upcoming)
    } catch (err) {
      console.error('Failed to fetch upcoming plans:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (plan) => {
    if (plan.locked) {
      return <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#fee2e2', color: '#991b1b' }}>Locked</span>
    }
    if (plan.published) {
      return <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#d1fae5', color: '#065f46' }}>Published</span>
    }
    if (plan.exists) {
      return <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#fef3c7', color: '#92400e' }}>Draft</span>
    }
    return <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: '#f3f4f6', color: '#6b7280' }}>Not created</span>
  }

  if (loading) {
    return (
      <section style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '8px',
        padding: '16px',
        minWidth: '260px'
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 600 }}>📅 Upcoming Game Plans</h3>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
          Loading...
        </div>
      </section>
    )
  }

  return (
    <section style={{ 
      background: 'var(--surface)', 
      border: '1px solid var(--border)', 
      borderRadius: '8px',
      padding: '16px',
      minWidth: '260px',
      maxWidth: '320px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>📅 Upcoming Game Plans</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Next {maxDays} days</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {plans.map((plan, index) => (
          <div 
            key={plan.date}
            className="upcoming-plan-item"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>
                {index === 0 ? 'Today' : plan.dayName}, {plan.dayDate}
              </div>
              {getStatusBadge(plan)}
            </div>
            {onEditDate && (
              <button 
                onClick={() => onEditDate(plan.date)}
                className="btn btn-sm"
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Edit
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default UpcomingPlans
