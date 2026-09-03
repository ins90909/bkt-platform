'use client';

import React, { useState } from 'react';

// --- DEMO DATA ---
const MOCK_STUDENT = {
  name: "Insar Amantay",
  grade: "10th Grade",
  completedTasks: 142,
  stats: {
    overallMastery: 84,
    accuracyRate: 91,
    currentStreak: 7,
  },
  recentModules: [
    { title: "Quadratic Equations", score: 92, status: "Mastered" },
    { title: "Polynomial Factoring", score: 68, status: "Review Needed" },
    { title: "Systems of Equations", score: 85, status: "In Progress" },
  ]
};

const MOCK_TEACHER = {
  name: "Dr. Alex Rivera",
  totalClasses: 4,
  classList: ["Grade 10A Math", "Grade 10B Math", "AP Calculus AB", "SAT Prep Cohort"],
  bestStudent: {
    name: "Insar Amantay",
    grade: "10th Grade",
    mastery: 94,
    completedTasks: 158,
  },
  worstStudent: {
    name: "Marcus Vance",
    grade: "10th Grade",
    mastery: 41,
    completedTasks: 32,
    needsHelpWith: "Polynomial Factoring",
  }
};

export default function DemoCabinetPage() {
  const [viewMode, setViewMode] = useState<'student' | 'teacher'>('student');

  return (
    <div className="min-h-screen bg-sky-50 text-slate-800 font-sans">
      {/* DEMO SWITCHER BAR */}
      <div className="bg-white border-b border-sky-100 px-6 py-3 flex justify-between items-center text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold text-slate-700">
            DEMO MODE &bull; Active View: <span className="text-sky-700 uppercase">{viewMode}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('student')}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${
              viewMode === 'student'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
            }`}
          >
            Student Cabinet
          </button>
          <button
            onClick={() => setViewMode('teacher')}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${
              viewMode === 'teacher'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
            }`}
          >
            Teacher Dashboard
          </button>
        </div>
      </div>

      {/* HEADER */}
      <header className="bg-white border-b border-sky-100 px-8 py-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <span className="text-xs font-semibold text-sky-600 uppercase tracking-wider">
              {viewMode === 'student' ? 'Student Personal Workspace' : 'Teacher Analytics Center'}
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              {viewMode === 'student' ? MOCK_STUDENT.name : MOCK_TEACHER.name}
            </h1>
          </div>
          <div className="bg-sky-50 px-4 py-2 rounded-lg border border-sky-100 text-right text-xs">
            <p className="font-bold text-slate-800">
              {viewMode === 'student' ? MOCK_STUDENT.grade : `${MOCK_TEACHER.totalClasses} Assigned Classes`}
            </p>
            <p className="text-slate-500">Authenticated Session</p>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-6xl mx-auto p-8">
        {viewMode === 'student' ? (
          <StudentCabinetView data={MOCK_STUDENT} />
        ) : (
          <TeacherDashboardView data={MOCK_TEACHER} />
        )}
      </main>
    </div>
  );
}

// --- STUDENT CABINET VIEW ---
function StudentCabinetView({ data }: { data: typeof MOCK_STUDENT }) {
  return (
    <div className="space-y-6">
      {/* Primary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-sky-100 p-5 rounded-lg shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Completed Tasks</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{data.completedTasks}</p>
          <span className="text-xs text-slate-400 mt-1 block">Problem sets & diagnostics</span>
        </div>

        <div className="bg-white border border-sky-100 p-5 rounded-lg shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Overall Mastery</p>
          <p className="text-3xl font-bold text-sky-600 mt-2">{data.stats.overallMastery}%</p>
          <span className="text-xs text-slate-400 mt-1 block">BKT aggregate score</span>
        </div>

        <div className="bg-white border border-sky-100 p-5 rounded-lg shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Accuracy Rate</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{data.stats.accuracyRate}%</p>
          <span className="text-xs text-slate-400 mt-1 block">First-attempt success</span>
        </div>

        <div className="bg-white border border-sky-100 p-5 rounded-lg shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Active Streak</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{data.stats.currentStreak} Days</p>
          <span className="text-xs text-slate-400 mt-1 block">Daily practice routine</span>
        </div>
      </div>

      {/* Details & Modules */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-sky-100 p-6 rounded-lg shadow-xs lg:col-span-1 space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-sky-100 pb-3">Student Profile</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Full Name</span>
              <span className="font-semibold text-slate-800">{data.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Grade Level</span>
              <span className="font-semibold text-slate-800">{data.grade}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded text-xs">Active</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-sky-100 p-6 rounded-lg shadow-xs lg:col-span-2">
          <h2 className="text-base font-bold text-slate-900 mb-4">Topic Progress</h2>
          <div className="space-y-3">
            {data.recentModules.map((module, i) => (
              <div key={i} className="bg-sky-50/50 border border-sky-100 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-slate-800">{module.title}</p>
                  <span className="text-xs text-slate-500">{module.status}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-sky-700">{module.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- TEACHER DASHBOARD VIEW ---
function TeacherDashboardView({ data }: { data: typeof MOCK_TEACHER }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Class Roster Summary */}
        <div className="bg-white border border-sky-100 p-6 rounded-lg shadow-xs lg:col-span-1">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Assigned Classes</p>
          <p className="text-4xl font-bold text-sky-600 mt-2">{data.totalClasses}</p>
          <div className="mt-4 pt-4 border-t border-sky-100 space-y-2">
            {data.classList.map((cls, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>{cls}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Best Student */}
        <div className="bg-emerald-50/50 border border-emerald-200 p-6 rounded-lg shadow-xs lg:col-span-1">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2.5 py-1 rounded border border-emerald-200 inline-block">
            Top Performing Student
          </span>
          <h3 className="text-xl font-bold text-slate-900 mt-4">{data.bestStudent.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{data.bestStudent.grade}</p>

          <div className="mt-6 grid grid-cols-2 gap-2 pt-4 border-t border-emerald-200/60 text-xs">
            <div>
              <span className="text-slate-500 block">Mastery Score</span>
              <span className="text-lg font-bold text-emerald-700">{data.bestStudent.mastery}%</span>
            </div>
            <div>
              <span className="text-slate-500 block">Tasks Completed</span>
              <span className="text-lg font-bold text-slate-800">{data.bestStudent.completedTasks}</span>
            </div>
          </div>
        </div>

        {/* Support Needed */}
        <div className="bg-amber-50/50 border border-amber-200 p-6 rounded-lg shadow-xs lg:col-span-1">
          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider bg-amber-100 px-2.5 py-1 rounded border border-amber-200 inline-block">
            Support Needed
          </span>
          <h3 className="text-xl font-bold text-slate-900 mt-4">{data.worstStudent.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{data.worstStudent.grade}</p>

          <div className="mt-6 grid grid-cols-2 gap-2 pt-4 border-t border-amber-200/60 text-xs">
            <div>
              <span className="text-slate-500 block">Mastery Score</span>
              <span className="text-lg font-bold text-amber-700">{data.worstStudent.mastery}%</span>
            </div>
            <div>
              <span className="text-slate-500 block">Target Topic</span>
              <span className="text-xs font-medium text-slate-800">{data.worstStudent.needsHelpWith}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}