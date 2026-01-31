# DynamoDB Storage Plan (Code-only)

## Goals
- Use DynamoDB single-table design as the only storage implementation.
- No data migration; start with an empty DynamoDB table.
- Preserve current user-facing behavior with cursor-based pagination.

## Scope
- Entities: conferences, conferenceMenuItems, boards, posts.
- Exclude: runtime session state and logs.

## Assumptions
- Application is Node.js and can be updated to use DynamoDB client.
- Pagination is cursor-based (`LastEvaluatedKey`).
- All PK/SK identifiers are ULIDs (string) for direct access.
- Root conference uses `conferenceId = 0` to sort first in list views.
- User-facing numeric inputs for conferences/boards use `entryNo` (number) stored as attributes.
- `entryNo` may be duplicated; on input, the first match in list order is chosen.
- Nested conference indexing is not finalized; only a global list via `CONF_LIST` is defined.

## Target DynamoDB Design (Summary)
- Table: `bbs` (single table)
- Primary Key: `PK` (partition), `SK` (sort)
- GSIs (suggested):
  - GS1: post by id (sparse/overloaded)

### Key Patterns
- Conference: `PK=CONF`, `SK=CONF#<id>`
- MenuItem: `PK=CONF#<conferenceId>`, `SK=MENU#<menuItemId>`
- Board: `PK=BOARD#<boardId>`, `SK=BOARD`
- Post: `PK=BOARD#<boardId>`, `SK=POST#<postId>`

### GS1 Patterns (Overloaded)
- Post by id: `GS1PK=POST#<postId>`, `GS1SK=POST`

## Query Mapping (Current Code -> DynamoDB)
| Operation | DynamoDB | Key Condition | Index | Notes |
| --- | --- | --- | --- | --- |
| listConferences | Query | `PK=CONF` | base | id asc (root has id=0) |
| getRootConference | GetItem | `PK=CONF`, `SK=CONF#0` | base |  |
| getConference(id) | GetItem | `PK=CONF`, `SK=CONF#<id>` | base |  |
| listBoards(conferenceId) | Query via menu items | `PK=CONF#<id>`, `begins_with(SK,'MENU#')` | base | filter actionType=board |
| getBoard(boardId) | GetItem | `PK=BOARD#<boardId>`, `SK=BOARD` | base |  |
| listMenuItems(conferenceId) | Query | `PK=CONF#<id>`, `begins_with(SK,'MENU#')` | base | ULID order |
| getMenuItem(conferenceId, menuItemId) | GetItem | `PK=CONF#<id>`, `SK=MENU#<menuItemId>` | base |  |
| listPosts(boardId, pageSize, cursor) | Query | `PK=BOARD#<boardId>`, `begins_with(SK,'POST#')` | base | `ScanIndexForward=false`, ULID ordering, cursor via `ExclusiveStartKey` |
| getPost(postId) | Query | `GS1PK=POST#<postId>` | GS1 | `Limit=1` |

## Entity Mapping (Logical)
| Entity | DynamoDB Item | Notes |
| --- | --- | --- |
| conferences | Conference item | includes isRoot, welcome/menu fields, `entryNo` |
| conferenceMenuItems | Menu item | menuItemId in SK (ULID) |
| boards | Board item | `entryNo` stored for input; not owned by conferences (linked via menu items) |
| posts | Post item | ULID in SK for ordering; `createdAt` stored as attribute |

## Rollout Strategy
1. Provision DynamoDB table and GSIs.
2. Seed default data (root conference, main conference, general board, menu items).
3. Configure table/region and start server.

## Detailed Steps

### 1) Preparation
- Finalize DynamoDB table and GS1 definition.
- Provision table and IAM role (least privilege).
- Configure environment:
  - `BBS_DDB_TABLE=bbs`
  - `BBS_DDB_REGION=ap-northeast-2`
- Implement cursor pagination responses in API.

### 2) Implement DynamoDB DAL
- Create repository functions for conferences, menu items, boards, and posts.
- Use Query (not Scan) for list operations.
- Use conditional writes to avoid duplicate seeds.
- Keep item shapes consistent by entityType.

### 3) Seed Defaults (No Data Migration)
- Recreate default seed data in DynamoDB.
- Seed order:
  - root conference (isRoot=1)
  - default conference (main)
  - general board
  - menu items for the default conference
- Make seeding idempotent (conditional put on PK/SK).

### 4) Start
- Configure table/region and start server.

### 5) Verification
- Smoke tests:
  - Create session, list conferences, navigate boards via menu items.
  - Create a post, list posts with cursor.
  - Read a post by id.

### 6) Post-Start
- Monitor error rate, latency, and throttling.

## Risks and Mitigations
- Pagination changes: update client/server together.
- Seed duplication: use conditional writes on PK/SK.

## Go/No-Go Criteria
- DynamoDB table and GSIs are active.
- Smoke tests pass in staging.
- DynamoDB read latency within target (p95 < 50ms).

## Appendix: Item Shapes (Example)
```json
{
  "PK": "CONF",
  "SK": "CONF#01HXZ2H6D6C5X3E3Z0T0Y9B3EV",
  "entityType": "CONFERENCE",
  "id": "01HXZ2H6D6C5X3E3Z0T0Y9B3EV",
  "name": "Main",
  "isRoot": 0,
  "entryNo": 1,
  "welcomeTitle": "Welcome",
  "welcomeBody": "",
  "menuTitle": "Menu",
  "menuBody": "",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "updatedBy": "system"
}
```
