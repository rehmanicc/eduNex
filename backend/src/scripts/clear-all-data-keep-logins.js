require("dotenv").config();
const mongoose = require("mongoose");

const YES = "--yes";

function idString(v) {
  if (!v) return null;

  if (typeof v === "object" && v._id) {
    return String(v._id);
  }

  return String(v);
}

function uniqueIds(values = []) {
  return [
    ...new Set(
      values
        .map(idString)
        .filter(Boolean)
    ),
  ];
}

function toObjectIds(ids = []) {
  return ids
    .filter((id) =>
      mongoose.Types.ObjectId.isValid(String(id))
    )
    .map(
      (id) =>
        new mongoose.Types.ObjectId(String(id))
    );
}

async function main() {
  if (!process.argv.includes(YES)) {
    console.log("");
    console.log("================================================");
    console.log("  DESTRUCTIVE DATABASE RESET");
    console.log("================================================");
    console.log("");
    console.log(
      "This script will DELETE all CMS operational data."
    );
    console.log("");
    console.log(
      "Only Platform Owner + Director login dependencies will remain."
    );
    console.log("");
    console.log("Run again with:");
    console.log("");
    console.log(
      "node src/scripts/clear-all-data-keep-logins.js --yes"
    );
    console.log("");
    process.exit(0);
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from .env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const db = mongoose.connection.db;

  console.log("Connected to:", db.databaseName);

  const collections = (
    await db.listCollections().toArray()
  ).map((x) => x.name);

  console.log(
    `Collections found: ${collections.length}`
  );

  const users = db.collection("users");
  const roles = db.collection("roles");
  const colleges = db.collection("colleges");
  const employees = db.collection("employees");

  // ----------------------------------------------------
  // 1. LOAD ROLES
  // ----------------------------------------------------

  const allRoles = await roles.find({}).toArray();

  const roleMap = new Map(
    allRoles.map((r) => [
      String(r._id),
      String(
        r.name ||
        r.code ||
        r.key ||
        r.slug ||
        ""
      )
        .trim()
        .toLowerCase(),
    ])
  );

  function userRoleNames(user) {
    const names = [];

    if (user.systemRole) {
      names.push(
        String(user.systemRole)
          .trim()
          .toLowerCase()
      );
    }

    if (user.role) {
      if (
        typeof user.role === "string" &&
        roleMap.has(user.role)
      ) {
        names.push(roleMap.get(user.role));
      } else if (
        typeof user.role === "object" &&
        user.role._id
      ) {
        names.push(
          roleMap.get(String(user.role._id)) ||
          String(
            user.role.name ||
            user.role.code ||
            user.role.key ||
            ""
          )
            .trim()
            .toLowerCase()
        );
      } else {
        names.push(
          String(user.role)
            .trim()
            .toLowerCase()
        );
      }
    }

    const possibleRoleArrays = [
      user.roles,
      user.roleIds,
      user.assignedRoles,
    ];

    for (const arr of possibleRoleArrays) {
      if (!Array.isArray(arr)) continue;

      for (const role of arr) {
        if (
          typeof role === "string" ||
          role instanceof mongoose.Types.ObjectId
        ) {
          names.push(
            roleMap.get(String(role)) ||
            String(role)
              .trim()
              .toLowerCase()
          );
        } else if (role?._id) {
          names.push(
            roleMap.get(String(role._id)) ||
            String(
              role.name ||
              role.code ||
              role.key ||
              ""
            )
              .trim()
              .toLowerCase()
          );
        }
      }
    }

    return [
      ...new Set(
        names.filter(Boolean)
      ),
    ];
  }

  // ----------------------------------------------------
  // 2. IDENTIFY PLATFORM OWNER + DIRECTOR
  // ----------------------------------------------------

  const allUsers = await users.find({}).toArray();

  const platformOwners = [];
  const directors = [];

  for (const user of allUsers) {
    const names = userRoleNames(user);

    const email = String(user.email || "")
      .trim()
      .toLowerCase();

    const name = String(user.name || "")
      .trim()
      .toLowerCase();

    const isPlatformOwner =
      String(user.systemRole || "")
        .trim()
        .toLowerCase() === "platform_owner" ||
      names.includes("platform_owner") ||
      names.includes("platform owner");

    /*
     * Current Demo Director does not expose role/roles/systemRole
     * in the user document, so support:
     * - normal role-based detection
     * - known demo Director email
     * - exact Director name fallback
     */
    const isDirector =
      names.includes("director") ||
      names.includes("institution_director") ||
      names.includes("institution director") ||
      email === "director@demo.local" ||
      name === "demo director" ||
      name === "director";

    if (isPlatformOwner) {
      platformOwners.push(user);
    }

    if (isDirector) {
      directors.push(user);
    }
  }

  console.log("");
  console.log("Accounts detected:");
  console.log(
    `Platform Owner(s): ${platformOwners.length}`
  );
  console.log(
    `Director(s):       ${directors.length}`
  );

  for (const u of platformOwners) {
    console.log(
      `  Platform Owner: ${u.email || u.name || u._id}`
    );
  }

  for (const u of directors) {
    console.log(
      `  Director: ${u.email || u.name || u._id}`
    );
  }

  if (platformOwners.length === 0) {
    throw new Error(
      "ABORTED: No Platform Owner account was detected."
    );
  }

  if (directors.length === 0) {
    throw new Error(
      "ABORTED: No Director account was detected."
    );
  }

  // ----------------------------------------------------
  // 3. IDS TO PRESERVE
  // ----------------------------------------------------

  const preservedUsers = [
    ...platformOwners,
    ...directors,
  ];

  const preserveUserIds = uniqueIds(
    preservedUsers.map((u) => u._id)
  );

  const preserveCollegeIds = uniqueIds(
    directors.flatMap((u) => [
      u.collegeId,
      u.tenantId,
    ])
  );

  // ----------------------------------------------------
  // 4. PRESERVE REQUIRED ROLES
  // ----------------------------------------------------

  const preserveRoleIds = [];

  for (const user of preservedUsers) {
    const possibleRoleArrays = [
      user.roles,
      user.roleIds,
      user.assignedRoles,
    ];

    for (const arr of possibleRoleArrays) {
      if (!Array.isArray(arr)) continue;

      for (const r of arr) {
        const candidate = r?._id || r;

        if (
          candidate &&
          mongoose.Types.ObjectId.isValid(
            String(candidate)
          )
        ) {
          preserveRoleIds.push(candidate);
        }
      }
    }

    if (user.role) {
      const candidate =
        user.role?._id || user.role;

      if (
        mongoose.Types.ObjectId.isValid(
          String(candidate)
        )
      ) {
        preserveRoleIds.push(candidate);
      }
    }
  }

  /*
   * Always preserve Director / Platform Owner role definitions.
   */
  for (const role of allRoles) {
    const code = String(role.code || "")
      .trim()
      .toLowerCase();

    const name = String(role.name || "")
      .trim()
      .toLowerCase();

    if (
      code === "director" ||
      name === "director" ||
      code === "platform_owner" ||
      name === "platform owner"
    ) {
      preserveRoleIds.push(role._id);
    }
  }

  const uniquePreserveRoleIds =
    uniqueIds(preserveRoleIds);

  // ----------------------------------------------------
  // 5. FIND DIRECTOR EMPLOYEE PROFILE
  // ----------------------------------------------------

  const directorObjectIds = toObjectIds(
    directors.map((u) => u._id)
  );

  let preservedEmployees = [];

  if (collections.includes("employees")) {
    preservedEmployees =
      await employees
        .find({
          $or: [
            {
              userId: {
                $in: directorObjectIds,
              },
            },
            {
              linkedUserId: {
                $in: directorObjectIds,
              },
            },
            {
              loginUserId: {
                $in: directorObjectIds,
              },
            },
          ],
        })
        .toArray();
  }

  const preserveEmployeeIds = uniqueIds(
    preservedEmployees.map((e) => e._id)
  );

  const preserveDesignationIds = uniqueIds(
    preservedEmployees.flatMap((e) => [
      e.designationId,
      e.designation,
    ])
  );

  console.log("");
  console.log(
    "Director employee profiles:",
    preserveEmployeeIds.length
  );

  // ----------------------------------------------------
  // 6. SHOW PRESERVED INSTITUTIONS
  // ----------------------------------------------------

  if (preserveCollegeIds.length) {
    const keptColleges =
      await colleges
        .find({
          _id: {
            $in: toObjectIds(
              preserveCollegeIds
            ),
          },
        })
        .toArray();

    console.log("");
    console.log("Institutions preserved:");

    for (const c of keptColleges) {
      console.log(
        `  ${c.name || c.title || c._id}` +
        `${c.slug ? ` [${c.slug}]` : ""}`
      );
    }
  }

  // ----------------------------------------------------
  // 7. PRESERVATION RULES
  // ----------------------------------------------------

  const KEEP = {
    users: {
      _id: {
        $in: toObjectIds(
          preserveUserIds
        ),
      },
    },

    roles: {
      _id: {
        $in: toObjectIds(
          uniquePreserveRoleIds
        ),
      },
    },

    colleges: {
      _id: {
        $in: toObjectIds(
          preserveCollegeIds
        ),
      },
    },

    employees: {
      _id: {
        $in: toObjectIds(
          preserveEmployeeIds
        ),
      },
    },

    designations: {
      _id: {
        $in: toObjectIds(
          preserveDesignationIds
        ),
      },
    },

    /*
     * Preserve employee sequence for kept Director institution,
     * so if the Director employee already has E01, next employee
     * does not accidentally receive the same employee number.
     */
    employeesequences:
      preserveCollegeIds.length
        ? {
            $or: [
              {
                collegeId: {
                  $in: toObjectIds(
                    preserveCollegeIds
                  ),
                },
              },
              {
                tenantId: {
                  $in: toObjectIds(
                    preserveCollegeIds
                  ),
                },
              },
            ],
          }
        : { _id: null },
  };

  // ----------------------------------------------------
  // 8. FINAL SAFETY SUMMARY
  // ----------------------------------------------------

  console.log("");
  console.log(
    "=============================================="
  );
  console.log("PRESERVATION SUMMARY");
  console.log(
    "=============================================="
  );

  console.log(
    `Users to keep:        ${preserveUserIds.length}`
  );

  console.log(
    `Colleges to keep:     ${preserveCollegeIds.length}`
  );

  console.log(
    `Roles to keep:        ${uniquePreserveRoleIds.length}`
  );

  console.log(
    `Employees to keep:    ${preserveEmployeeIds.length}`
  );

  console.log(
    `Designations to keep: ${preserveDesignationIds.length}`
  );

  // ----------------------------------------------------
  // 9. RESET
  // ----------------------------------------------------

  console.log("");
  console.log(
    "=============================================="
  );
  console.log("RESETTING DATABASE");
  console.log(
    "=============================================="
  );

  let totalDeleted = 0;

  for (const collectionName of collections) {
    if (
      collectionName.startsWith("system.")
    ) {
      continue;
    }

    const collection =
      db.collection(collectionName);

    let result;

    if (KEEP[collectionName]) {
      result = await collection.deleteMany({
        $nor: [KEEP[collectionName]],
      });
    } else {
      result =
        await collection.deleteMany({});
    }

    totalDeleted += result.deletedCount;

    console.log(
      `${collectionName.padEnd(30)} deleted: ${result.deletedCount}`
    );
  }

  // ----------------------------------------------------
  // 10. FINAL VALIDATION
  // ----------------------------------------------------

  const remainingUsers =
    await users.find({}).toArray();

  console.log("");
  console.log(
    "=============================================="
  );
  console.log("RESET COMPLETE");
  console.log(
    "=============================================="
  );

  console.log("");
  console.log(
    `Total documents deleted: ${totalDeleted}`
  );

  console.log("");
  console.log("Remaining users:");

  for (const u of remainingUsers) {
    console.log(
      `  ${u.email || u.name || u._id}`
    );
  }

  console.log("");

  console.log(
    `Remaining colleges: ${await colleges.countDocuments()}`
  );

  console.log(
    `Remaining employees: ${await employees.countDocuments()}`
  );

  console.log(
    `Remaining roles: ${await roles.countDocuments()}`
  );

  if (collections.includes("sequences")) {
    console.log(
      `Remaining general sequences: ${await db
        .collection("sequences")
        .countDocuments()}`
    );
  }

  console.log("");
  console.log(
    "All student, admission, inquiry, academic,"
  );
  console.log(
    "fee, voucher, payment and operational data"
  );
  console.log(
    "has been cleared."
  );

  console.log("");
  console.log(
    "General numbering sequences were cleared,"
  );
  console.log(
    "so new Forms/Vouchers/Roll Nos will start"
  );
  console.log(
    "from their initial sequence values."
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("");
  console.error("RESET FAILED:");
  console.error(err.message);
  console.error("");

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});