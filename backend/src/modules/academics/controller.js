const AcademicSession = require('../../models/AcademicSession');
const SessionProgramPeriod = require('../../models/SessionProgramPeriod');
const Department = require('../../models/Department'); // legacy only
const Branch = require('../../models/Branch');
const BranchWing = require('../../models/BranchWing');
const Wing = require('../../models/Wing');
const Program = require('../../models/Program');
const Course = require('../../models/Course');
const Subject = require('../../models/Subject');
const Section = require('../../models/Section');
const TeacherAssignment = require('../../models/TeacherAssignment');
const Timetable = require('../../models/Timetable');
const Employee = require('../../models/Employee');
const Student = require('../../models/Student');
const AdmissionApplication = require('../../models/AdmissionApplication');

const scopeService = require('../../services/dataScopeService');
const { audit } = require('../../services/auditService');
const { toId } = require('../../utils/normalize');


/* =========================================================
   POPULATION MAP
========================================================= */

const populateMap = {
  sessions: [],

  sessionPeriods: [
    'academicSessionId',
    { path: 'programId', populate: ['branchId', 'wingId'] }
  ],

  departments: [],

  programs: [
    'departmentId',
    'branchId',
    'wingId'
  ],

  courses: [
    'programId',
    'subjectId'
  ],

  sections: [
    'programId',
    'academicSessionId',
    'classTeacherId'
  ],

  assignments: [
    'academicSessionId',
    'programId',
    'sectionId',
    'courseId',
    'teacherId'
  ],
};


/* =========================================================
   RESOURCE MODEL MAP
========================================================= */

const modelMap = {
  sessions: AcademicSession,
  sessionPeriods: SessionProgramPeriod,
  departments: Department,
  programs: Program,
  courses: Course,
  sections: Section,
  assignments: TeacherAssignment,
};


function offeringTypeForAcademicType(academicType) {
  if (academicType === 'school') return 'class';
  if (academicType === 'cambridge') return 'cambridge_level';
  return 'program';
}

function normalizeOfferingDefaults(payload) {
  if (!payload.academicType) return payload;

  payload.offeringType =
    offeringTypeForAcademicType(payload.academicType);

  // School Classes are always one annual academic period.
  if (payload.academicType === 'school') {
    payload.academicSystem = 'annual';
    payload.durationUnits = 1;
    payload.durationSemesters = 1;
  }

  // College, Cambridge and University stay configurable.
  if (payload.durationUnits !== undefined) {
    payload.durationUnits = Number(payload.durationUnits);
    payload.durationSemesters = payload.durationUnits;
  }

  return payload;
}


/* =========================================================
   NORMALIZE PAYLOAD
========================================================= */

function normalizeAcademicPayload(resource, body) {
  const payload = {
    ...body
  };

  // -------------------------------------------------------
  // SESSION / PROGRAM PERIODS
  // -------------------------------------------------------
  if (resource === 'sessionPeriods') {
    if (payload.startDate) payload.startDate = new Date(payload.startDate);
    if (payload.endDate) payload.endDate = new Date(payload.endDate);
  }


  // -------------------------------------------------------
  // PROGRAMS
  // -------------------------------------------------------

  if (resource === 'programs') {
payload.academicSystem =
      payload.academicSystem || 'semester';

    if (payload.durationUnits !== undefined) {
      payload.durationUnits =
        Number(payload.durationUnits);

      // Backward compatibility
      payload.durationSemesters =
        payload.durationUnits;
    }
    else if (
      payload.durationSemesters !== undefined
    ) {
      payload.durationUnits =
        Number(payload.durationSemesters);

      payload.durationSemesters =
        payload.durationUnits;
    }

    normalizeOfferingDefaults(payload);
  }


  // -------------------------------------------------------
  // PERIOD BASED RESOURCES
  // -------------------------------------------------------

  if (
    [
      'courses',
      'sections',
      'assignments'
    ].includes(resource)
  ) {
    const period =
      payload.periodNumber ??
      payload.semester;

    if (
      period !== undefined &&
      period !== ''
    ) {
      payload.periodNumber =
        Number(period);

      // Legacy compatibility
      payload.semester =
        Number(period);
    }
  }


  // -------------------------------------------------------
  // COURSES
  // -------------------------------------------------------

  if (resource === 'courses') {
    if (
      payload.creditHours !== undefined &&
      payload.creditHours !== ''
    ) {
      payload.creditHours =
        Number(payload.creditHours);
    }
  }


  // -------------------------------------------------------
  // SECTIONS
  // -------------------------------------------------------

  if (resource === 'sections') {
    if (
      payload.capacity !== undefined &&
      payload.capacity !== ''
    ) {
      payload.capacity =
        Number(payload.capacity);
    }
    if (payload.classTeacherId === '') payload.classTeacherId = null;
  }


  return payload;
}


/* =========================================================
   PROGRAM PERIOD VALIDATION
========================================================= */

async function validatePeriodForProgram(
  req,
  programId,
  periodNumber
) {
  const collegeId =
    req.collegeId ||
    req.user.collegeId;

  const program =
    await Program.findOne({
      _id: programId,
      collegeId
    });

  if (!program) {
    throw Object.assign(
      new Error('Invalid program'),
      {
        status: 400
      }
    );
  }


  const period =
    Number(periodNumber);

  const duration =
    Number(
      program.durationUnits ||
      program.durationSemesters ||
      1
    );


  if (
    !Number.isInteger(period) ||
    period < 1 ||
    period > duration
  ) {
    const unit =
      program.academicSystem === 'annual'
        ? 'year'
        : 'semester';

    throw Object.assign(
      new Error(
        `Invalid ${unit}. ` +
        `${program.name} supports ${duration} ` +
        `${unit}${duration === 1 ? '' : 's'}.`
      ),
      {
        status: 400
      }
    );
  }


  return program;
}


/* =========================================================
   ACADEMIC DATA SCOPE
========================================================= */

async function scopedFilter(
  req,
  resource
) {
  const base =
    req.tenantFilter();

  const scope =
    await scopeService.academicScope(
      req.user,
      req.collegeId ||
      req.user.collegeId
    );


  // -------------------------------------------------------
  // COLLEGE LEVEL
  // -------------------------------------------------------

  if (scope.type === 'college') {
    // Principal branch access is enforced at query level for branch-aware
    // academic resources. Director and other institution-wide roles keep
    // the normal tenant-wide filter.
    if (!req.hasAllBranchAccess) {
      const allowed = req.allowedBranchIds || [];
      if (resource === 'programs') return { ...base, branchId: { $in: allowed } };
      if (resource === 'sessionPeriods') {
        const programIds = await Program.find({ ...base, branchId: { $in: allowed } }).distinct('_id');
        return { ...base, programId: { $in: programIds } };
      }
      if (['courses','sections','assignments'].includes(resource)) {
        const programIds = await Program.find({ ...base, branchId: { $in: allowed } }).distinct('_id');
        return { ...base, programId: { $in: programIds } };
      }
    }
    return base;
  }


  // -------------------------------------------------------
  // STUDENT
  // -------------------------------------------------------

  if (scope.type === 'student') {

    if (resource === 'sessions') {
      return {
        ...base,
        _id: scope.academicSessionId
      };
    }


    if (resource === 'programs') {
      return {
        ...base,
        _id: scope.programId
      };
    }

    if (resource === 'sessionPeriods') {
      return {
        ...base,
        academicSessionId: scope.academicSessionId,
        programId: scope.programId
      };
    }


    if (resource === 'sections') {
      return {
        ...base,
        _id: scope.sectionId
      };
    }


    if (resource === 'courses') {
      return {
        ...base,

        programId:
          scope.programId,

        $or: [
          {
            periodNumber: {
              $lte: 50
            }
          },

          {
            semester: {
              $lte: 50
            }
          }
        ]
      };
    }


    if (resource === 'assignments') {
      return {
        ...base,

        sectionId:
          scope.sectionId,

        isActive: true
      };
    }


    if (resource === 'departments') {
      const program =
        await Program.findOne({
          _id: scope.programId,
          collegeId: base.collegeId
        })
          .select('departmentId')
          .lean();


      return program?.departmentId
        ? {
            ...base,
            _id: program.departmentId
          }
        : {
            ...base,
            _id: null
          };
    }
  }


  // -------------------------------------------------------
  // TEACHER
  // -------------------------------------------------------

  if (scope.type === 'teacher') {

    if (resource === 'sessions') {
      return {
        ...base,
        _id: {
          $in:
            scope.academicSessionIds
        }
      };
    }


    if (resource === 'programs') {
      return {
        ...base,
        _id: {
          $in:
            scope.programIds
        }
      };
    }

    if (resource === 'sessionPeriods') {
      return {
        ...base,
        academicSessionId: { $in: scope.academicSessionIds },
        programId: { $in: scope.programIds }
      };
    }


    if (resource === 'sections') {
      return {
        ...base,
        _id: {
          $in:
            scope.sectionIds
        }
      };
    }


    if (resource === 'courses') {
      return {
        ...base,
        _id: {
          $in:
            scope.courseIds
        }
      };
    }


    if (resource === 'assignments') {
      return {
        ...base,

        teacherId:
          scope.employeeId,

        isActive: true
      };
    }


    if (resource === 'departments') {
      return base;
    }
  }


  if (
    [
      'sessions',
      'sessionPeriods',
      'departments',
      'programs',
      'courses',
      'sections'
    ].includes(resource)
  ) {
    return base;
  }


  return {
    ...base,
    _id: null
  };
}


/* =========================================================
   LIST
========================================================= */

exports.list = async (
  req,
  res
) => {
  const {
    resource
  } = req.params;

  const Model =
    modelMap[resource];


  if (!Model) {
    return res
      .status(404)
      .json({
        error:
          'Academic resource not found'
      });
  }


  const filter =
    await scopedFilter(
      req,
      resource
    );


  const docs =
    await Model.find(filter)
      .populate(
        populateMap[resource]
      )
      .sort({
        createdAt: -1
      })
      .limit(500);


  res.json(docs);
};


/* =========================================================
   GET ONE
========================================================= */

exports.get = async (
  req,
  res
) => {
  const {
    resource,
    id
  } = req.params;


  const Model =
    modelMap[resource];


  if (!Model) {
    return res
      .status(404)
      .json({
        error:
          'Academic resource not found'
      });
  }


  const filter =
    await scopedFilter(
      req,
      resource
    );


  const doc =
    await Model.findOne({
      ...filter,
      _id: id
    })
      .populate(
        populateMap[resource]
      );


  if (!doc) {
    return res
      .status(404)
      .json({
        error: 'Not found'
      });
  }


  res.json(doc);
};



/* =========================================================
   SESSION / PROGRAM PERIOD VALIDATION
========================================================= */

async function validateSessionProgramPeriod(req, payload, existing = null) {
  const collegeId = req.collegeId || req.user.collegeId;
  const merged = {
    ...(existing?.toObject ? existing.toObject() : existing || {}),
    ...payload
  };

  if (!merged.academicSessionId || !merged.programId) {
    throw Object.assign(
      new Error('Academic Session and Class / Program are required.'),
      { status: 400 }
    );
  }

  const [session, program] = await Promise.all([
    AcademicSession.findOne({ _id: merged.academicSessionId, collegeId }),
    Program.findOne({ _id: merged.programId, collegeId })
  ]);

  if (!session) throw Object.assign(new Error('Invalid Academic Session'), { status: 400 });
  if (!program) throw Object.assign(new Error('Invalid Class / Program'), { status: 400 });
  req.assertBranch(program.branchId);

  const start = new Date(merged.startDate);
  const end = new Date(merged.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw Object.assign(new Error('Valid Start Date and End Date are required.'), { status: 400 });
  }
  if (end < start) {
    throw Object.assign(new Error('End Date must be on or after Start Date.'), { status: 400 });
  }

  payload.startDate = start;
  payload.endDate = end;
  return { session, program };
}

/* =========================================================
   SECTION GENDER RULE
========================================================= */

const SECTION_GENDER_TYPES = new Set(['boys', 'girls']);
const UNIVERSITY_SECTION_GENDER_TYPES = new Set(['boys', 'girls', 'both']);

async function validateSectionGender(req, payload, existing = null) {
  const collegeId = req.collegeId || req.user.collegeId;
  const merged = {
    ...(existing?.toObject ? existing.toObject() : existing || {}),
    ...payload
  };

  if (!merged.programId) {
    throw Object.assign(
      new Error('Class / Program is required for Section'),
      { status: 400 }
    );
  }

  const program = await Program.findOne({
    _id: merged.programId,
    collegeId
  }).select('name branchId academicType');

  if (!program) {
    throw Object.assign(
      new Error('Invalid Class / Program'),
      { status: 400 }
    );
  }

  req.assertBranch(program.branchId);

  const allowedGenderTypes =
    program.academicType === 'university'
      ? UNIVERSITY_SECTION_GENDER_TYPES
      : SECTION_GENDER_TYPES;

  if (!allowedGenderTypes.has(merged.genderType)) {
    throw Object.assign(
      new Error(
        program.academicType === 'university'
          ? 'Section Gender must be Boys, Girls or Both.'
          : 'Section Gender must be Boys or Girls.'
      ),
      { status: 400 }
    );
  }

  if (merged.classTeacherId) {
    const classTeacher = await Employee.findOne({
      _id: merged.classTeacherId,
      collegeId,
      isActive: true,
      category: 'academic_staff'
    }).select('_id');
    if (!classTeacher) {
      throw Object.assign(
        new Error('Class Teacher must be an active Academic employee.'),
        { status: 400 }
      );
    }
  }

  payload.genderType = merged.genderType;
  return program;
}


/* =========================================================
   VALIDATE TEACHER ASSIGNMENT
========================================================= */

async function validateAssignment(
  req,
  payload
) {
  const collegeId =
    req.collegeId ||
    req.user.collegeId;


  const [
    session,
    program,
    section,
    course,
    teacher
  ] =
    await Promise.all([

      AcademicSession.findOne({
        _id:
          payload.academicSessionId,

        collegeId
      }),


      Program.findOne({
        _id:
          payload.programId,

        collegeId
      }),


      Section.findOne({
        _id:
          payload.sectionId,

        collegeId
      }),


      Course.findOne({
        _id:
          payload.courseId,

        collegeId
      }),


      Employee.findOne({
        _id:
          payload.teacherId,

        collegeId,

        isActive: true
      })

    ]);


  if (
    !session ||
    !program ||
    !section ||
    !course ||
    !teacher
  ) {
    throw Object.assign(
      new Error(
        'Invalid academic assignment references'
      ),
      {
        status: 400
      }
    );
  }


  // v3.6+ Employee records use Academic Staff / Non-Teaching Staff.
  // Keep legacy teacher records compatible while allowing Academic Staff
  // to be selected for academic assignments.
  const isAcademicStaff =
    teacher.category === 'academic_staff' ||
    String(teacher.type || '').toLowerCase() === 'teacher';

  if (!isAcademicStaff) {
    throw Object.assign(
      new Error(
        'Assigned employee must belong to Academic Staff'
      ),
      {
        status: 400
      }
    );
  }


  if (
    toId(section.programId) !==
      toId(program._id) ||

    toId(course.programId) !==
      toId(program._id)
  ) {
    throw Object.assign(
      new Error(
        'Section and course must belong to the selected program'
      ),
      {
        status: 400
      }
    );
  }


  if (
    toId(
      section.academicSessionId
    ) !==
    toId(session._id)
  ) {
    throw Object.assign(
      new Error(
        'Section must belong to the selected academic session'
      ),
      {
        status: 400
      }
    );
  }


  const sectionPeriod =
    Number(
      section.periodNumber ||
      section.semester
    );


  const coursePeriod =
    Number(
      course.periodNumber ||
      course.semester
    );


  const assignmentPeriod =
    Number(
      payload.periodNumber ||
      payload.semester
    );


  if (
    sectionPeriod !==
      assignmentPeriod ||

    coursePeriod !==
      assignmentPeriod
  ) {
    throw Object.assign(
      new Error(
        'Course, section and teacher assignment academic period must match'
      ),
      {
        status: 400
      }
    );
  }


  await validatePeriodForProgram(
    req,
    program._id,
    assignmentPeriod
  );
}


async function assertAcademicPayloadBranchAccess(
  req,
  resource,
  payload,
  existing = null
) {
  if (req.hasAllBranchAccess) return;

  const merged = {
    ...(existing?.toObject ? existing.toObject() : existing || {}),
    ...payload
  };

  if (resource === 'programs') {
    if (!merged.branchId) {
      throw Object.assign(
        new Error('Branch is required for Class / Program'),
        { status: 400 }
      );
    }

    req.assertBranch(merged.branchId);
    return;
  }

  if (['sessionPeriods', 'courses', 'sections', 'assignments'].includes(resource)) {
    if (!merged.programId) {
      throw Object.assign(
        new Error('Class / Program is required'),
        { status: 400 }
      );
    }

    const program = await Program.findOne(
      req.tenantFilter({ _id: merged.programId })
    )
      .select('branchId')
      .lean();

    if (!program) {
      throw Object.assign(
        new Error('Class / Program not found'),
        { status: 404 }
      );
    }

    req.assertBranch(program.branchId);
  }
}


async function validateProgramProvisioning(req,payload,existing=null){
  const collegeId=req.collegeId||req.user.collegeId;
  const branchId=payload.branchId||existing?.branchId;
  const wingId=payload.wingId||existing?.wingId;

  if(!branchId||!wingId){
    throw Object.assign(
      new Error('Branch and Wing are required for Classes / Programs.'),
      {status:400}
    );
  }

  req.assertBranch(branchId);

  const [wing,mapping]=await Promise.all([
    Wing.findOne({_id:wingId,collegeId,isActive:true}),
    BranchWing.findOne({
      collegeId,
      branchId,
      wingId,
      isActive:true
    })
  ]);

  if(!wing){
    throw Object.assign(new Error('Invalid or inactive Wing.'),{status:400});
  }

  if(!mapping){
    throw Object.assign(
      new Error('Selected Wing is not assigned to the selected Branch.'),
      {status:400}
    );
  }

  payload.academicType=wing.academicType;
  payload.offeringType=offeringTypeForAcademicType(wing.academicType);
  normalizeOfferingDefaults(payload);

  return wing;
}



const PREDEFINED_SUBJECTS = [
  ['English', 'ENG'],
  ['Urdu', 'URD'],
  ['Mathematics', 'MATH'],
  ['General Science', 'GSCI'],
  ['Physics', 'PHY'],
  ['Chemistry', 'CHEM'],
  ['Biology', 'BIO'],
  ['Computer Science', 'CS'],
  ['Islamiat', 'ISL'],
  ['Pakistan Studies', 'PST'],
  ['Social Studies', 'SST'],
  ['General Knowledge', 'GK']
];

async function ensurePredefinedSubjects(collegeId) {
  const ops = PREDEFINED_SUBJECTS.map(([name, code]) => ({
    updateOne: {
      filter: { collegeId, code },
      update: {
        $setOnInsert: {
          collegeId,
          name,
          code,
          defaultCourseType: 'theory',
          isPredefined: true,
          isActive: true
        }
      },
      upsert: true
    }
  }));
  if (ops.length) await Subject.bulkWrite(ops, { ordered: false });
}

exports.subjects = async (req, res) => {
  const collegeId = req.collegeId || req.user.collegeId;
  await ensurePredefinedSubjects(collegeId);
  const rows = await Subject.find(req.tenantFilter({ isActive: true }))
    .sort({ isPredefined: -1, name: 1 })
    .lean();
  res.json(rows);
};

exports.createSubject = async (req, res) => {
  const collegeId = req.collegeId || req.user.collegeId;
  const name = String(req.body.name || '').trim();
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!name || !code) {
    return res.status(400).json({ error: 'Subject name and code are required.' });
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await Subject.findOne({ collegeId, $or: [{ code }, { name: new RegExp(`^${escapedName}$`, 'i') }] });
  if (existing) {
    if (existing.isActive === false) {
      existing.isActive = true;
      await existing.save();
    }
    return res.json(existing);
  }
  const doc = await Subject.create({
    collegeId,
    name,
    code,
    defaultCourseType: req.body.defaultCourseType || 'theory',
    isPredefined: false,
    isActive: true
  });
  await audit(req, 'CREATE', 'Subject', doc._id);
  res.status(201).json(doc);
};

exports.bulkAssignCourses = async (req, res) => {
  const collegeId = req.collegeId || req.user.collegeId;
  const programId = req.body.programId;
  const periodNumber = Number(req.body.periodNumber || 1);
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (!programId) return res.status(400).json({ error: 'Class / Program is required.' });
  const program = await validatePeriodForProgram(req, programId, periodNumber);
  req.assertBranch(program.branchId);

  const subjectIds = [...new Set(items.map(x => String(x.subjectId || '')).filter(Boolean))];
  const subjects = await Subject.find({ collegeId, _id: { $in: subjectIds }, isActive: true }).lean();
  if (subjects.length !== subjectIds.length) {
    return res.status(400).json({ error: 'One or more selected subjects are invalid.' });
  }
  const subjectById = new Map(subjects.map(x => [String(x._id), x]));

  const existing = await Course.find({ collegeId, programId, periodNumber });
  const selectedSet = new Set(subjectIds);

  for (const row of existing) {
    const sid = row.subjectId ? String(row.subjectId) : '';
    if (sid && selectedSet.has(sid)) continue;
    const fallbackSelected = items.some(i => {
      const sub = subjectById.get(String(i.subjectId));
      return sub && (String(sub.code).toUpperCase() === String(row.code).toUpperCase() || String(sub.name).toLowerCase() === String(row.name).toLowerCase());
    });
    if (fallbackSelected) continue;

    const inUse = await TeacherAssignment.exists({ collegeId, courseId: row._id });
    if (inUse) {
      return res.status(409).json({
        error: `${row.name} cannot be removed because it is already used in Teacher Assignment / Timetable.`
      });
    }
    await Course.deleteOne({ _id: row._id, collegeId });
  }

  const saved = [];
  for (const item of items) {
    const subject = subjectById.get(String(item.subjectId));
    if (!subject) continue;

    const rawCreditHours = item.creditHours;
    let creditHours = null;
    if (rawCreditHours !== undefined && rawCreditHours !== null && rawCreditHours !== '') {
      creditHours = Number(rawCreditHours);
      if (!Number.isFinite(creditHours) || creditHours < 0) {
        return res.status(400).json({ error: `Credit Hours must be a valid non-negative number for ${subject.name}.` });
      }
    }

    let course = await Course.findOne({ collegeId, programId, periodNumber, subjectId: subject._id });
    if (!course) {
      course = await Course.findOne({
        collegeId,
        programId,
        periodNumber,
        $or: [{ code: subject.code }, { name: subject.name }]
      });
    }
    if (!course) course = new Course({ collegeId, programId, periodNumber });

    course.subjectId = subject._id;
    course.name = subject.name;
    course.code = subject.code;
    course.creditHours = creditHours;
    course.courseType = item.courseType || subject.defaultCourseType || 'theory';
    course.isActive = true;
    await course.save();
    saved.push(course);
  }

  res.json({ saved: saved.length });
};

exports.structure=async(req,res)=>{
  const [branches,mappings,wings]=await Promise.all([
    Branch.find(req.branchFilter({isActive:true})).sort({name:1}).lean(),
    BranchWing.find(req.tenantFilter({isActive:true})).lean(),
    Wing.find(req.tenantFilter({isActive:true})).sort({name:1}).lean()
  ]);

  const branchIds=new Set(branches.map(x=>String(x._id)));
  const wingById=new Map(wings.map(w=>[String(w._id),w]));

  res.json({
    academicTypes:[
      {value:'school',label:'School'},
      {value:'college',label:'College'},
      {value:'cambridge',label:'Cambridge'},
      {value:'university',label:'University'}
    ],
    wings,
    branches:branches.map(b=>({
      ...b,
      wingIds:mappings
        .filter(m=>
          String(m.branchId)===String(b._id) &&
          branchIds.has(String(m.branchId)) &&
          wingById.has(String(m.wingId))
        )
        .map(m=>String(m.wingId))
    }))
  });
};

/* =========================================================
   CREATE
========================================================= */

exports.create = async (
  req,
  res
) => {
  const {
    resource
  } = req.params;


  const Model =
    modelMap[resource];


  if (!Model) {
    return res
      .status(404)
      .json({
        error:
          'Academic resource not found'
      });
  }


  let payload =
    normalizeAcademicPayload(
      resource,
      {
        ...req.body,

        collegeId:
          req.collegeId ||
          req.user.collegeId
      }
    );


  await assertAcademicPayloadBranchAccess(req,resource,payload);

  if (resource === 'programs') {
    await validateProgramProvisioning(req,payload);
  }

  if (resource === 'sessionPeriods') {
    await validateSessionProgramPeriod(req, payload);
  }

  if (
    resource === 'courses' ||
    resource === 'sections'
  ) {
    await validatePeriodForProgram(
      req,
      payload.programId,
      payload.periodNumber
    );
  }

  if (resource === 'sections') {
    await validateSectionGender(req, payload);
  }


  if (
    resource === 'assignments'
  ) {
    await validateAssignment(
      req,
      payload
    );
  }


  const doc =
    await Model.create(
      payload
    );


  await audit(
    req,
    'CREATE',
    Model.modelName,
    doc._id
  );


  res
    .status(201)
    .json(doc);
};


/* =========================================================
   UPDATE
========================================================= */

exports.update = async (
  req,
  res
) => {
  const {
    resource,
    id
  } = req.params;


  const Model =
    modelMap[resource];


  if (!Model) {
    return res
      .status(404)
      .json({
        error:
          'Academic resource not found'
      });
  }


  const accessFilter = await scopedFilter(req, resource);
  const existing = await Model.findOne({ ...accessFilter, _id: id });


  if (!existing) {
    return res
      .status(404)
      .json({
        error: 'Not found'
      });
  }


  let payload =
    normalizeAcademicPayload(
      resource,
      {
        ...req.body
      }
    );


  delete payload.collegeId;

  await assertAcademicPayloadBranchAccess(req,resource,payload,existing);

  if (resource === 'programs') {
    await validateProgramProvisioning(req,payload,existing);
  }

  if (resource === 'sessionPeriods') {
    await validateSessionProgramPeriod(req, payload, existing);
  }

  if (
    resource === 'courses' ||
    resource === 'sections'
  ) {
    const merged = {
      ...existing.toObject(),
      ...payload
    };


    await validatePeriodForProgram(
      req,

      merged.programId,

      merged.periodNumber ||
      merged.semester
    );
  }

  if (resource === 'sections') {
    await validateSectionGender(req, payload, existing);
  }


  if (
    resource === 'assignments'
  ) {
    await validateAssignment(
      req,

      normalizeAcademicPayload(
        'assignments',
        {
          ...existing.toObject(),
          ...payload
        }
      )
    );
  }


  const doc =
    await Model.findOneAndUpdate(
      req.tenantFilter({
        _id: id
      }),

      payload,

      {
        new: true,
        runValidators: true
      }
    );


  await audit(
    req,
    'UPDATE',
    Model.modelName,
    doc._id,
    {
      fields:
        Object.keys(payload)
    }
  );


  res.json(doc);
};


/* =========================================================
   DELETE
========================================================= */

exports.remove = async (
  req,
  res
) => {
  const {
    resource,
    id
  } = req.params;


  const Model =
    modelMap[resource];


  if (!Model) {
    return res
      .status(404)
      .json({
        error:
          'Academic resource not found'
      });
  }


  const collegeId =
    req.collegeId ||
    req.user.collegeId;


  /* -------------------------------------------------------
     SESSION SAFE DELETE
  --------------------------------------------------------- */

  if (resource === 'sessions') {

    const [
      sessionPeriods,
      sections,
      assignments,
      timetable,
      students,
      admissions
    ] =
      await Promise.all([

        SessionProgramPeriod.countDocuments({
          collegeId,
          academicSessionId: id
        }),

        Section.countDocuments({
          collegeId,
          academicSessionId: id
        }),

        TeacherAssignment.countDocuments({
          collegeId,
          academicSessionId: id
        }),

        Timetable.countDocuments({
          collegeId,
          academicSessionId: id
        }),

        Student.countDocuments({
          collegeId,
          academicSessionId: id
        }),

        AdmissionApplication.countDocuments({
          collegeId,
          academicSessionId: id
        })

      ]);


    const dependencies = [];


    if (sessionPeriods) {
      dependencies.push(
        `${sessionPeriods} class / program period(s)`
      );
    }


    if (sections) {
      dependencies.push(
        `${sections} section(s)`
      );
    }


    if (assignments) {
      dependencies.push(
        `${assignments} teacher assignment(s)`
      );
    }


    if (timetable) {
      dependencies.push(
        `${timetable} timetable slot(s)`
      );
    }


    if (students) {
      dependencies.push(
        `${students} student(s)`
      );
    }


    if (admissions) {
      dependencies.push(
        `${admissions} admission application(s)`
      );
    }


    if (dependencies.length) {
      return res
        .status(409)
        .json({
          error:
            `Academic session cannot be deleted because it is already in use: ${dependencies.join(', ')}.`
        });
    }
  }


  /* -------------------------------------------------------
     DEPARTMENT SAFE DELETE
  --------------------------------------------------------- */

  if (
    resource === 'departments'
  ) {

    const programs =
      await Program.countDocuments({
        collegeId,
        departmentId: id
      });


    if (programs) {
      return res
        .status(409)
        .json({
          error:
            `Department cannot be deleted because ${programs} program(s) are linked to it.`
        });
    }
  }


  /* -------------------------------------------------------
     PROGRAM SAFE DELETE
  --------------------------------------------------------- */

  if (
    resource === 'programs'
  ) {

    const [
      sessionPeriods,
      courses,
      sections,
      assignments,
      students,
      admissions
    ] =
      await Promise.all([

        SessionProgramPeriod.countDocuments({
          collegeId,
          programId: id
        }),

        Course.countDocuments({
          collegeId,
          programId: id
        }),

        Section.countDocuments({
          collegeId,
          programId: id
        }),

        TeacherAssignment.countDocuments({
          collegeId,
          programId: id
        }),

        Student.countDocuments({
          collegeId,
          programId: id
        }),

        AdmissionApplication.countDocuments({
          collegeId,
          programId: id
        })

      ]);


    const dependencies = [];


    if (sessionPeriods) {
      dependencies.push(
        `${sessionPeriods} session period(s)`
      );
    }


    if (courses) {
      dependencies.push(
        `${courses} course(s)`
      );
    }


    if (sections) {
      dependencies.push(
        `${sections} section(s)`
      );
    }


    if (assignments) {
      dependencies.push(
        `${assignments} teacher assignment(s)`
      );
    }


    if (students) {
      dependencies.push(
        `${students} student(s)`
      );
    }


    if (admissions) {
      dependencies.push(
        `${admissions} admission application(s)`
      );
    }


    if (dependencies.length) {
      return res
        .status(409)
        .json({
          error:
            `Program cannot be deleted because it is already in use: ${dependencies.join(', ')}.`
        });
    }
  }


  /* -------------------------------------------------------
     COURSE SAFE DELETE
  --------------------------------------------------------- */

  if (
    resource === 'courses'
  ) {

    const [
      assignments,
      timetable
    ] =
      await Promise.all([

        TeacherAssignment.countDocuments({
          collegeId,
          courseId: id
        }),

        Timetable.countDocuments({
          collegeId,
          courseId: id
        })

      ]);


    const dependencies = [];


    if (assignments) {
      dependencies.push(
        `${assignments} teacher assignment(s)`
      );
    }


    if (timetable) {
      dependencies.push(
        `${timetable} timetable slot(s)`
      );
    }


    if (dependencies.length) {
      return res
        .status(409)
        .json({
          error:
            `Course cannot be deleted because it is already in use: ${dependencies.join(', ')}.`
        });
    }
  }


  /* -------------------------------------------------------
     SECTION SAFE DELETE
  --------------------------------------------------------- */

  if (
    resource === 'sections'
  ) {

    const [
      assignments,
      timetable,
      students
    ] =
      await Promise.all([

        TeacherAssignment.countDocuments({
          collegeId,
          sectionId: id
        }),

        Timetable.countDocuments({
          collegeId,
          sectionId: id
        }),

        Student.countDocuments({
          collegeId,
          sectionId: id
        })

      ]);


    const dependencies = [];


    if (assignments) {
      dependencies.push(
        `${assignments} teacher assignment(s)`
      );
    }


    if (timetable) {
      dependencies.push(
        `${timetable} timetable slot(s)`
      );
    }


    if (students) {
      dependencies.push(
        `${students} student(s)`
      );
    }


    if (dependencies.length) {
      return res
        .status(409)
        .json({
          error:
            `Section cannot be deleted because it is already in use: ${dependencies.join(', ')}.`
        });
    }
  }


  /* -------------------------------------------------------
     ASSIGNMENT SAFE DELETE
  --------------------------------------------------------- */

  if (
    resource === 'assignments'
  ) {

    const timetableCount =
      await Timetable.countDocuments({
        collegeId,

        teacherAssignmentId:
          id
      });


    if (timetableCount) {
      return res
        .status(409)
        .json({
          error:
            `Teacher assignment cannot be deleted because ${timetableCount} timetable slot(s) use it.`
        });
    }
  }


  /* -------------------------------------------------------
     DELETE
  --------------------------------------------------------- */

  const deleteAccessFilter = await scopedFilter(req, resource);
  const doc = await Model.findOneAndDelete({ ...deleteAccessFilter, _id: id });


  if (!doc) {
    return res
      .status(404)
      .json({
        error: 'Not found'
      });
  }


  await audit(
    req,
    'DELETE',
    Model.modelName,
    doc._id
  );


  res.json({
    message:
      `${Model.modelName} deleted successfully`
  });
};


/* =========================================================
   TEACHER WORKLOAD
========================================================= */

exports.teacherWorkload =
  async (
    req,
    res
  ) => {

    const filter =
      req.tenantFilter({
        isActive: true
      });


    if (
      req.query.teacherId
    ) {
      filter.teacherId =
        req.query.teacherId;
    }


    if (
      scopeService
        .isTeacherUser(
          req.user
        )
    ) {
      filter.teacherId =
        req.user.linkedEmployeeId;
    }


    const rows =
      await TeacherAssignment
        .find(filter)
        .populate(
          'teacherId courseId sectionId academicSessionId programId'
        )
        .sort({
          teacherId: 1
        });


    res.json(rows);
  };
