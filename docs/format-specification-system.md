# 论文格式规范体系设计

## 核心理念

```
┌─────────────────────────────────────────────────────────────────┐
│  第1层: 系统默认规范（内置兜底）                                │
│  - 字体: 宋体/黑体/Times New Roman                              │
│  - 字号: 小四号(12pt) 正文                                      │
│  - 行距: 1.5倍                                                  │
│  - 页边距: 上下2.54cm, 左右3.17cm                               │
│  - 引用: GB/T 7714 顺序编码制                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ 被覆盖
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  第2层: 学校模板规范（从模板文件提取）                          │
│  - 来源: 用户上传的 .doc/.docx 模板文件                        │
│  - 提取方式: AI 解析 + 人工校验                                │
│  - 存储: template_specification.json                           │
│  - 内容: 字体、字号、行距、页边距、章节结构                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ 被补充
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  第3层: 补充材料规范（额外说明文档）                            │
│  - 来源: 格式说明文档、写作指南、评审标准                      │
│  - 类型: .doc/.docx/.pdf/.md                                    │
│  - 作用: 补充模板中没有的细节要求                              │
│  - 示例: "参考文献必须使用GB/T 7714-2015格式"                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ 合并
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  最终规范: 用于生成论文的完整配置                               │
│  - 优先级: 补充材料 > 学校模板 > 系统默认                      │
│  - 格式: JSON DSL                                               │
│  - 用途: 驱动 DocxService 生成格式化论文                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 一、规范层次结构

### 1.1 系统默认规范（内置）

```json
{
  "system_defaults": {
    "fonts": {
      "body": { "family": "宋体", "size_pt": 12, "bold": false },
      "heading_l1": { "family": "黑体", "size_pt": 18, "bold": true, "align": "center" },
      "heading_l2": { "family": "黑体", "size_pt": 15, "bold": true },
      "heading_l3": { "family": "黑体", "size_pt": 14, "bold": true },
      "en_body": { "family": "Times New Roman", "size_pt": 12 },
      "en_title": { "family": "Times New Roman", "size_pt": 22, "bold": false }
    },
    "spacing": {
      "line": 1.5,
      "first_line_indent": 2,
      "paragraph_before": 0,
      "paragraph_after": 0
    },
    "margin": {
      "top": 2.54,
      "bottom": 2.54,
      "left": 3.17,
      "right": 3.17
    },
    "citation": {
      "type": "GB/T 7714",
      "style": "顺序编码制",
      "in_text_format": "[{n}]"
    }
  }
}
```

### 1.2 学校模板规范（提取）

**来源**: 用户上传的模板文件

**提取方式**:
1. AI 自动解析（首选）
2. 人工校验和补充

**存储格式**:
```json
{
  "school_name": "XX大学",
  "degree_level": "bachelor",
  "discipline": "计算机科学与技术",
  "template_file": "XX大学本科毕业论文模板.docx",
  
  "structure": {
    "sections": [
      { "type": "cover", "required": true, "label": "封面" },
      { "type": "abstract_cn", "required": true, "label": "中文摘要" },
      { "type": "abstract_en", "required": true, "label": "英文摘要" },
      { "type": "toc", "required": true, "label": "目录" },
      { "type": "chapter", "required": true, "label": "正文" },
      { "type": "references", "required": true, "label": "参考文献" },
      { "type": "acknowledgments", "required": true, "label": "致谢" },
      { "type": "appendix", "required": false, "label": "附录" }
    ]
  },
  
  "format_rules": {
    "fonts": {
      "body": { "family": "宋体", "size_pt": 12 },
      "heading_l1": { "family": "黑体", "size_pt": 18, "bold": true, "align": "center" },
      "cover_title": { "family": "宋体", "size_pt": 22, "bold": true, "align": "center" }
    },
    "spacing": { "line": 1.5, "first_line_indent": 2 },
    "margin": { "top": 2.5, "bottom": 2.0, "left": 2.5, "right": 2.0 }
  },
  
  "citation_rules": {
    "type": "GB/T 7714",
    "style": "顺序编码制"
  },
  
  "extracted_at": "2026-06-05T10:00:00Z",
  "confidence": 0.85
}
```

### 1.3 补充材料规范

**来源**: 格式说明文档、写作指南等

**类型**:
- 格式补充说明（如："参考文献必须用GB/T 7714-2015"）
- 写作规范（如："摘要不超过500字"）
- 特殊要求（如："图表标题用五号宋体"）

**存储格式**:
```json
{
  "school_name": "XX大学",
  "supplementary_file": "XX大学毕业论文格式补充说明.pdf",
  
  "overrides": {
    "fonts": {
      "reference_item": { "family": "宋体", "size_pt": 10.5 }
    },
    "rules": [
      "参考文献必须使用GB/T 7714-2015格式",
      "摘要字数不超过500字",
      "关键词3-5个，用分号分隔",
      "图表编号按章节，如图2-1、表3-1"
    ]
  },
  
  "extracted_at": "2026-06-05T11:00:00Z"
}
```

---

## 二、规范合并算法

### 2.1 优先级规则

```
补充材料规范 > 学校模板规范 > 系统默认规范
```

### 2.2 合并策略

```python
def merge_specifications(system_default, school_template, supplementary):
    """
    合并三层规范，返回最终规范
    
    优先级: supplementary > school_template > system_default
    """
    final_spec = {}
    
    # 1. 从系统默认开始
    final_spec = deep_copy(system_default)
    
    # 2. 用学校模板覆盖
    if school_template:
        final_spec = deep_merge(final_spec, school_template)
    
    # 3. 用补充材料覆盖
    if supplementary:
        final_spec = deep_merge(final_spec, supplementary)
    
    return final_spec
```

### 2.3 合并示例

```python
# 系统默认
system_default = {
    "fonts": {
        "body": {"family": "宋体", "size_pt": 12}
    },
    "spacing": {"line": 1.5}
}

# 学校模板
school_template = {
    "fonts": {
        "body": {"family": "仿宋", "size_pt": 14}  # 学校要求仿宋14号
    }
}

# 补充材料
supplementary = {
    "spacing": {"line": 1.25}  # 补充说明要求1.25倍行距
}

# 最终结果
final = {
    "fonts": {
        "body": {"family": "仿宋", "size_pt": 14}  # 来自学校模板
    },
    "spacing": {"line": 1.25}  # 来自补充材料
}
```

---

## 三、数据模型设计

### 3.1 数据库表结构

```sql
-- 学校表
CREATE TABLE schools (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),  -- 学校代码
    created_at TIMESTAMP DEFAULT NOW()
);

-- 模板组表（一个学校可以有多个模板组，按学位层次）
CREATE TABLE school_template_groups (
    id UUID PRIMARY KEY,
    school_id UUID REFERENCES schools(id),
    degree_level VARCHAR(20),  -- bachelor/master/doctor
    discipline VARCHAR(100),   -- 学科门类
    name VARCHAR(200),         -- 模板组名称
    
    -- 三套规范 DSL
    structure_json JSONB,
    format_rules_json JSONB,
    citation_rules_json JSONB,
    
    -- 来源信息
    source_file_path VARCHAR(500),  -- 原始模板文件路径
    source_file_type VARCHAR(10),   -- doc/docx/pdf
    
    -- 状态
    status VARCHAR(20) DEFAULT 'draft',  -- draft/active/deprecated
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 补充材料表
CREATE TABLE template_supplements (
    id UUID PRIMARY KEY,
    group_id UUID REFERENCES school_template_groups(id),
    
    -- 补充内容
    file_path VARCHAR(500),
    file_name VARCHAR(200),
    file_type VARCHAR(10),
    
    -- 提取的规范覆盖
    overrides_json JSONB,
    
    -- 提取的规则文本
    rules_text TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用户上传的模板提交表（已有）
CREATE TABLE template_submissions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    school_name VARCHAR(100),
    degree_level VARCHAR(20),
    discipline VARCHAR(100),
    
    -- 文件信息
    file_path VARCHAR(500),
    file_name VARCHAR(200),
    
    -- AI 解析结果
    parsed_structure_json JSONB,
    parsed_format_json JSONB,
    parsed_citation_json JSONB,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 JSON Schema 定义

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TemplateSpecification",
  "type": "object",
  "properties": {
    "school_name": { "type": "string" },
    "degree_level": { 
      "type": "string",
      "enum": ["bachelor", "master", "doctor"]
    },
    "discipline": { "type": "string" },
    
    "structure": {
      "type": "object",
      "properties": {
        "sections": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": { "type": "string" },
              "required": { "type": "boolean" },
              "label": { "type": "string" }
            }
          }
        }
      }
    },
    
    "format_rules": {
      "type": "object",
      "properties": {
        "fonts": { "type": "object" },
        "spacing": { "type": "object" },
        "margin": { "type": "object" },
        "numbering": { "type": "object" }
      }
    },
    
    "citation_rules": {
      "type": "object",
      "properties": {
        "type": { "type": "string" },
        "style": { "type": "string" },
        "in_text_format": { "type": "string" },
        "document_types": { "type": "array" }
      }
    }
  }
}
```

---

## 四、AI 提取提示词

### 4.1 从模板文件提取规范

```
你是论文格式规范解析专家。请从以下学校论文模板中提取格式规范。

## 提取要求

1. **文档结构** (structure)
   - 列出所有必须包含的部分（封面、摘要、目录、正文、参考文献等）
   - 标注哪些是必须的，哪些是可选的

2. **排版规则** (format_rules)
   - 字体：标题、正文、英文的字体名称
   - 字号：各级标题、正文的字号（同时标注中文字号和磅值）
   - 行距：正文、摘要、参考文献的行距
   - 页边距：上下左右的距离（cm）
   - 对齐方式：标题、正文的对齐方式
   - 首行缩进：是否需要，缩进几个字符

3. **引用格式** (citation_rules)
   - 引用类型：如 GB/T 7714、APA、Harvard 等
   - 正文标注格式：如 [1]、(Author, Year)
   - 参考文献格式：各类文献（期刊、专著、学位论文等）的格式模板
   - 标点符号：中文文献用中文标点，英文文献用英文标点

## 输出格式

只输出JSON对象，不要其他内容。

{
  "structure": { ... },
  "format_rules": { ... },
  "citation_rules": { ... }
}

## 模板内容

{模板文件的文本内容}
```

### 4.2 从补充材料提取覆盖规则

```
你是论文格式规范解析专家。请从以下补充材料中提取需要覆盖的格式规则。

## 背景

学校已有基本模板，但这份补充材料包含额外的格式要求。

## 提取要求

1. 找出与基本模板不同的地方
2. 找出新增的规则
3. 找出更详细的要求

## 输出格式

{
  "overrides": {
    "fonts": { ... },  // 需要覆盖的字体设置
    "spacing": { ... },  // 需要覆盖的间距设置
    "rules": [...]  // 新增的规则文本
  }
}

## 基本模板规范

{学校模板的规范JSON}

## 补充材料内容

{补充材料的文本内容}
```

---

## 五、实现方案

### 5.1 规范解析服务

```python
# backend/app/services/spec_service.py

class SpecificationService:
    """规范管理服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_effective_specification(
        self, 
        school_id: UUID, 
        degree_level: str,
        discipline: str | None = None
    ) -> dict:
        """
        获取有效的规范配置
        
        合并顺序: 系统默认 → 学校模板 → 补充材料
        """
        # 1. 获取系统默认
        spec = self._get_system_defaults()
        
        # 2. 获取学校模板
        template = self._get_school_template(school_id, degree_level, discipline)
        if template:
            spec = self._deep_merge(spec, {
                "structure": template.structure_json,
                "format_rules": template.format_rules_json,
                "citation_rules": template.citation_rules_json,
            })
        
        # 3. 获取补充材料
        supplements = self._get_supplements(template.id if template else None)
        for sup in supplements:
            if sup.overrides_json:
                spec = self._deep_merge(spec, sup.overrides_json)
        
        return spec
    
    def extract_specification_from_file(
        self, 
        file_path: Path,
        llm_call: Callable
    ) -> dict:
        """
        从文件中提取规范
        
        Args:
            file_path: 模板文件路径
            llm_call: LLM 调用函数
        
        Returns:
            提取的规范配置
        """
        # 1. 读取文件内容
        content = self._read_file(file_path)
        
        # 2. 调用 AI 提取
        prompt = self._build_extraction_prompt(content)
        result = llm_call(prompt)
        
        # 3. 解析结果
        spec = json.loads(result)
        
        return spec
    
    def _get_system_defaults(self) -> dict:
        """获取系统默认规范"""
        return {
            "fonts": {
                "body": {"family": "宋体", "size_pt": 12, "bold": False},
                "heading_l1": {"family": "黑体", "size_pt": 18, "bold": True, "align": "center"},
                "heading_l2": {"family": "黑体", "size_pt": 15, "bold": True},
                "heading_l3": {"family": "黑体", "size_pt": 14, "bold": True},
                "en_body": {"family": "Times New Roman", "size_pt": 12},
                "en_title": {"family": "Times New Roman", "size_pt": 22, "bold": False},
            },
            "spacing": {
                "line": 1.5,
                "first_line_indent": 2,
                "paragraph_before": 0,
                "paragraph_after": 0,
            },
            "margin": {
                "top": 2.54,
                "bottom": 2.54,
                "left": 3.17,
                "right": 3.17,
            },
            "citation": {
                "type": "GB/T 7714",
                "style": "顺序编码制",
                "in_text_format": "[{n}]",
            },
        }
    
    def _deep_merge(self, base: dict, override: dict) -> dict:
        """深度合并两个字典"""
        result = base.copy()
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result
```

### 5.2 规范解析 API

```python
# backend/app/api/specifications.py

router = APIRouter()

@router.post("/extract")
async def extract_specification(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    file: UploadFile = File(...),
):
    """从模板文件中提取规范"""
    # 保存文件
    file_path = await save_upload(file)
    
    # 提取规范
    svc = SpecificationService(db)
    spec = svc.extract_specification_from_file(
        file_path,
        llm_call=lambda prompt: llm.call(...)
    )
    
    return spec


@router.get("/schools/{school_id}/specification")
async def get_school_specification(
    writer: WriterUserDep,
    db: DbSessionDep,
    school_id: UUID,
    degree_level: str = Query(...),
    discipline: str | None = Query(None),
):
    """获取学校的有效规范配置"""
    svc = SpecificationService(db)
    spec = svc.get_effective_specification(school_id, degree_level, discipline)
    return spec
```

---

## 六、前端展示方案

### 6.1 规范预览页面

```tsx
// frontend-writer/src/pages/SpecificationPreview.tsx

export function SpecificationPreview({ schoolId, degreeLevel }) {
  const { data: spec } = useQuery({
    queryKey: ['specification', schoolId, degreeLevel],
    queryFn: () => api.get(`/api/specifications/schools/${schoolId}/specification?degree_level=${degreeLevel}`)
  });

  return (
    <div className="spec-preview">
      <h2>格式规范预览</h2>
      
      <Card title="文档结构">
        <List>
          {spec.structure.sections.map(section => (
            <List.Item key={section.type}>
              <Tag color={section.required ? 'green' : 'default'}>
                {section.required ? '必须' : '可选'}
              </Tag>
              {section.label}
            </List.Item>
          ))}
        </List>
      </Card>
      
      <Card title="字体字号">
        <Table 
          dataSource={Object.entries(spec.format_rules.fonts)}
          columns={[
            { title: '元素', dataIndex: 'key' },
            { title: '字体', dataIndex: ['value', 'family'] },
            { title: '字号', render: (_, record) => `${record.value.size_pt}pt` },
            { title: '加粗', render: (_, record) => record.value.bold ? '是' : '否' },
          ]}
        />
      </Card>
      
      <Card title="引用格式">
        <p>类型: {spec.citation_rules.type}</p>
        <p>正文标注: {spec.citation_rules.in_text_format}</p>
      </Card>
      
      <Card title="来源">
        <p>系统默认: ✓</p>
        <p>学校模板: {spec.source?.template ? '✓' : '✗'}</p>
        <p>补充材料: {spec.source?.supplement ? '✓' : '✗'}</p>
      </Card>
    </div>
  );
}
```

### 6.2 规范对比功能

```tsx
// 显示规范来源
function SpecificationSource({ spec }) {
  return (
    <div>
      <h3>规范来源</h3>
      
      <Timeline>
        <Timeline.Item color="gray">
          <p>系统默认规范</p>
          <p>字体: 宋体小四号, 行距: 1.5倍</p>
        </Timeline.Item>
        
        {spec.school_template && (
          <Timeline.Item color="blue">
            <p>学校模板: {spec.school_template.name}</p>
            <p>覆盖: 字体改为仿宋, 行距改为1.25倍</p>
          </Timeline.Item>
        )}
        
        {spec.supplement && (
          <Timeline.Item color="green">
            <p>补充材料: {spec.supplement.name}</p>
            <p>新增: 参考文献必须用GB/T 7714-2015</p>
          </Timeline.Item>
        )}
      </Timeline>
    </div>
  );
}
```

---

## 七、测试检查清单

### 7.1 规范提取测试

- [ ] 从详细模板中提取完整规范
- [ ] 从简单模板中提取基本规范
- [ ] 从补充材料中提取覆盖规则
- [ ] 处理无法识别的格式（给出默认值）

### 7.2 规范合并测试

- [ ] 系统默认 + 学校模板 合并正确
- [ ] 系统默认 + 学校模板 + 补充材料 合并正确
- [ ] 补充材料覆盖学校模板
- [ ] 学校模板覆盖系统默认

### 7.3 论文生成测试

- [ ] 使用默认规范生成论文
- [ ] 使用学校模板规范生成论文
- [ ] 使用完整规范（三层合并）生成论文
- [ ] 生成的论文格式正确

---

## 八、使用流程

### 8.1 学校管理员流程

```
1. 上传学校模板文件
   ↓
2. AI 自动提取规范
   ↓
3. 人工校验和修正
   ↓
4. 上传补充材料（如果有）
   ↓
5. AI 提取补充规则
   ↓
6. 人工校验和修正
   ↓
7. 发布规范（状态改为 active）
```

### 8.2 用户（学生）流程

```
1. 选择学校和学位层次
   ↓
2. 系统自动加载规范
   ↓
3. 用户查看规范预览
   ↓
4. 用户撰写论文
   ↓
5. 系统按规范生成论文
   ↓
6. 用户下载 .doc 或 .docx
```

---

## 九、常见问题处理

### 9.1 模板信息不全

**问题**: 模板只写了"正文用宋体"，没有写字号

**处理**: 使用系统默认字号（小四号 12pt）

### 9.2 多个补充材料冲突

**问题**: 补充材料A说行距1.5倍，补充材料B说行距1.25倍

**处理**: 
1. 按时间顺序，后上传的覆盖先上传的
2. 或者标记冲突，让管理员手动解决

### 9.3 格式无法识别

**问题**: 模板中说"按学校规定"，但没有具体说明

**处理**: 
1. 使用系统默认值
2. 标记为"需要确认"
3. 提示管理员补充
