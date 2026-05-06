import { Triplet } from '../types';

export class NLGManager {
  private verbMap: Record<string, { my: string, en: string }> = {
    'is_a': { my: 'အမျိုးအစား ဖြစ်သည်', en: 'is a type of' },
    'has_property': { my: 'ဂုဏ်သတ္တိ ရှိသည်', en: 'has the property' },
    'is_at': { my: 'တွင် ရှိသည်', en: 'is located at' },
    'part_of': { my: '၏ အစိတ်အပိုင်း ဖြစ်သည်', en: 'is a part of' },
    'contains': { my: 'ပါဝင်သည်', en: 'contains' },
    'implies': { my: 'ဖြစ်စေသည်', en: 'implies' },
    'leads_to': { my: 'သို့ ဦးတည်သည်', en: 'leads to' },
    'eats': { my: 'စားသည်', en: 'eats' },
    'drinks': { my: 'သောက်သည်', en: 'drinks' },
    'knows': { my: 'သိသည်', en: 'knows' },
    'is_not': { my: 'မဟုတ်ပါ', en: 'is not' },
    'is_property': { my: 'ဖြစ်သည်', en: 'is a property' },
    'lives_in': { my: 'တွင် နေထိုင်သည်', en: 'lives in' },
    'works_at': { my: 'တွင် အလုပ်လုပ်သည်', en: 'works at' }
  };

  private connectorsMy = ['ပထမဦးစွာ', 'ထို့ပြင်', '၎င်းအပြင်', 'ဆက်လက်၍', 'အကျိုးဆက်အားဖြင့်'];
  private connectorsEn = ['Initially', 'Moreover', 'In addition', 'Then', 'Consequently'];

  private logicTypeMap: Record<string, { my: string, en: string }> = {
    'INHERITANCE': { my: 'အုပ်စုလိုက် ဂုဏ်သတ္တိ ဆက်ခံခြင်း', en: 'Class-based Inheritance' },
    'TRANSITIVE': { my: 'အဆင့်ဆင့် ကူးပြောင်း ဆက်နွယ်ခြင်း', en: 'Transitive Relationship' },
    'DIRECT': { my: 'တိုက်ရိုက် အဆိုပြုချက်', en: 'Direct Assertion' },
    'SYLLOGISM': { my: 'အနုမာန ဆင်ခြင်ခြင်း', en: 'Logical Syllogism' }
  };

  /**
   * Qualifies the certainty of a logical inference.
   */
  private qualifyCertainty(val: number): { my: string, en: string } {
    if (val >= 0.99) return { my: "သေချာပေါက်", en: "certainly" };
    if (val >= 0.9) return { my: "ခိုင်မာစွာ", en: "strongly" };
    if (val >= 0.7) return { my: "ဖြစ်နိုင်ခြေ မြင့်မားစွာဖြင့်", en: "highly likely" };
    if (val >= 0.5) return { my: "ဖြစ်နိုင်ခြေရှိစွာ", en: "likely" };
    return { my: "ခန့်မှန်းချက်ဖြင့်", en: "speculatively" };
  }

  /**
   * Translates a list of logical triplets into human-readable dual-language explanations.
   */
  public explainPath(path: Triplet[]): { my: string, en: string } {
    if (path.length === 0) return { my: "မည်သည့် ဆက်နွယ်မှုကိုမျှ မတွေ့ရှိရပါ။", en: "No relations found." };

    const mySentences = path.map((t, i) => {
      const v = this.verbMap[t.verb]?.my || t.verb.replace(/_/g, ' ');
      const conn = this.connectorsMy[i % this.connectorsMy.length];
      return `${conn} **${t.subject}** သည် **${t.object}** ${v}`;
    });

    const enSentences = path.map((t, i) => {
      const v = this.verbMap[t.verb]?.en || t.verb.replace(/_/g, ' ');
      const conn = this.connectorsEn[i % this.connectorsEn.length];
      return `${conn}, **${t.subject}** ${v} **${t.object}**`;
    });

    return {
      my: mySentences.join("။ ") + " ဖြစ်သောကြောင့် ဖြစ်ပါသည်။",
      en: enSentences.join(". ") + "."
    };
  }

  /**
   * Provides a dual-language confirmation for learned facts.
   */
  public getConfirmation(count: number, conflicts: number): string {
    if (count === 0) return "အချက်အလက်အသစ် မတွေ့ရှိရပါ သို့မဟုတ် ယုတ္တိဗေဒဆိုင်ရာ ကွဲလွဲမှုများ (No new facts found or logic conflicts).";
    
    let myMsg = `ဟုတ်ကဲ့၊ အချက်အလက်သစ် ${count} ခုကို Logic Tree အတွင်း အောင်မြင်စွာ ပေါင်းစပ်လိုက်ပါပြီ။ `;
    let enMsg = `Confirmed: Successfully integrated ${count} new facts into the Logic Tree. `;
    
    if (conflicts > 0) {
      myMsg += `သို့သော် ကွဲလွဲမှု ${conflicts} ခုကို တွေ့ရှိရသဖြင့် ဦးစားပေး ညှိနှိုင်းပေးထားပါသည်။`;
      enMsg += `Detected and resolved ${conflicts} contradictions using priority rules.`;
    } else {
      myMsg += "ယုတ္တိဗေဒဆိုင်ရာ စစ်ဆေးမှု အားလုံး အောင်မြင်ပါသည်။";
      enMsg += "All logic validation checks passed.";
    }
    return `${myMsg}\n\n--- English ---\n${enMsg}`;
  }

  /**
   * Explains why the engine doesn't know something (Symbolic AI constraints).
   */
  public explainMissing(input: string): string {
    const my = `ဆောရီး၊ **"${input}"** နဲ့ ပတ်သက်တဲ့ ယုတ္တိဗေဒ ဆက်စပ်မှုတွေကို ကျွန်တော့်ရဲ့ Knowledge Base ထဲမှာ မတွေ့ရှိရသေးပါဘူး။ \n\n**ဘာကြောင့်လဲဆိုတော့-**\nကျွန်တော်ဟာ LLM (Deep Learning) မဟုတ်ဘဲ **Symbolic AI (Neuro-Symbolic)** အမျိုးအစား ဖြစ်ပါတယ်။ ကျွန်တော့်မှာ ကြိုတင်လေ့ကျင့်ထားတဲ့ general knowledge မရှိဘဲ၊ သင်သင်ပေးထားတဲ့ သို့မဟုတ် စနစ်ထဲက ယုတ္တိဗေဒဆိုင်ရာ အချက်အလက် (Logical Facts) တွေကိုပဲ သိရှိတာ ဖြစ်ပါတယ်။\n\nဒါကို သိစေချင်ရင်တော့ အချက်အလက်တစ်ခုအနေနဲ့ (ဥပမာ - "A သည် B ဖြစ်သည်") ဆိုပြီး ကျွန်တော့်ကို သင်ပေးလိုက်ပါခင်ဗျာ။`;
    const en = `I'm sorry, I couldn't find any logical relations for **"${input}"** in my Knowledge Base.\n\n**Reason:**\nI am a **Symbolic AI (Neuro-Symbolic Engine)**, not a traditional Deep Learning LLM. I don't have vast pre-trained general knowledge; I only "know" the logical facts and rules that have been explicitly defined or taught to me.\n\nTo help me understand, please teach me a fact (e.g., "A is a type of B").`;
    
    return `### 💡 Missing Knowledge\n\n**🇲🇲 Burmese:**\n${my}\n\n---\n\n**🇺🇸 English:**\n${en}`;
  }

  /**
   * Explains the system's reasoning capabilities.
   */
  public explainCapabilities(): string {
    const capsMy = [
      "⦿ **Syllogistic Reasoning:** အဆိုပြုချက်နှစ်ခုမှ တတိယမြောက် ကောက်ချက်ကို ဆွဲထုတ်ခြင်း (ဥပမာ- A=B, B=C ဆိုလျှင် A=C)။",
      "⦿ **Inheritance:** အမျိုးအစား (Group) တစ်ခုကို သတ်မှတ်လိုက်ရုံဖြင့် ၎င်း၏ ဂုဏ်သတ္တိများကို အလိုအလျောက် ဆက်ခံခြင်း။",
      "⦿ **Conflict Resolution:** ရှေ့နောက်မညီညွတ်သော အချက်အလက်များကို ပယ်ချပြီး စနစ်မှန်ကန်မှုကို ထိန်းသိမ်းခြင်း။",
      "⦿ **Explainability:** တွက်ချက်မှုတိုင်းအတွက် အဆင့်ဆင့် ယုတ္တိဗေဒ လမ်းကြောင်း (Audit Trail) ကို ပြသနိုင်ခြင်း။"
    ];
    const capsEn = [
      "⦿ **Syllogistic Reasoning:** Deducing new conclusions from established facts (e.g., if A=B and B=C, then A=C).",
      "⦿ **Inheritance:** Automatically inheriting properties by assigning an entity to a category.",
      "⦿ **Conflict Resolution:** Identifying and blocking contradictory information to maintain semantic integrity.",
      "⦿ **Explainability:** Providing a full logical trace for every output (No 'Black Box')."
    ];

    return `### 🧠 System Capabilities\n\n**🇲🇲 Burmese:**\n${capsMy.join('\n')}\n\n---\n\n**🇺🇸 English:**\n${capsEn.join('\n')}`;
  }

  /**
   * Explains why the engine might not be finding facts despite database presence.
   */
  public explainBridgeStatus(dbStats: { factCount: number, nodeCount: number }): string {
    const my = `စနစ်အတွင်းမှာ အချက်အလက် (Facts) ပေါင်း **${dbStats.factCount}** ခုနဲ့ Logic Nodes ပေါင်း **${dbStats.nodeCount}** ခု ရှိနေတာကို တွေ့ရပါတယ်ခင်ဗျာ။ \n\n**ဘာလို့ ချက်ချင်း အဖြေမထွက်တာလဲ?**\n၁။ **Semantic Mapping:** User မေးလိုက်တဲ့ စကားလုံးနဲ့ Database ထဲက သတ်မှတ်ထားတဲ့ Entity Name မတူညီသေးတာ ဖြစ်နိုင်ပါတယ်။ (ဥပမာ- "လူ" နဲ့ "လူသား")\n၂။ **Bridge Logic:** Grammar Tree ကနေ Logic Tree ကို ကူးပြောင်းတဲ့အခါ စကားလုံး အထားအသို ကွဲလွဲမှုကြောင့် ဖြစ်နိုင်ပါတယ်။ \n၃။ **Inference Depth:** အချက်အလက်တွေက တစ်ခုနဲ့တစ်ခု ဆက်စပ်မှု အလွန်ဝေးနေရင် (ဥပမာ- အဆင့် ၁၀ ဆင့်ကျော်နေရင်) Logic Engine က ရှာတွေ့ဖို့ ခက်ခဲနိုင်ပါတယ်။`;
    const en = `The system detects **${dbStats.factCount}** facts and **${dbStats.nodeCount}** logic nodes in the database.\n\n**Why is it not reasoning immediately?**\n1. **Semantic Mapping:** Names in your query might not exactly match the Entity names in the DB (e.g., "Human" vs "Person").\n2. **Bridge Logic:** Differences in sentence structure between the Grammar Tree and Logic Tree mappings.\n3. **Inference Depth:** If the logical jump is too large (e.g., more than 10 transitive steps), the engine may time out.`;
    
    return `### 📊 Knowledge Bridge Status\n\n**🇲🇲 Burmese:**\n${my}\n\n---\n\n**🇺🇸 English:**\n${en}`;
  }

  /**
   * Generates a full bilingual response from a logical result object.
   */
  public generateResponse(result: any, input: string): string {
    if (!result) return "ဆောရီး၊ ကျွန်တော် အဲဒီအချက်အလက်ကို မသိသေးပါဘူး။ (I don't know that yet. Please teach me.)";
    
    if (result.type === 'CONVERSATION') {
        return `### Conversational Response\n\n${result.explanation}`;
    }

    const logicTypeInfo = result.logicType ? this.logicTypeMap[result.logicType] : null;
    const reasoningHeaderMy = logicTypeInfo ? `\n\n💡 **ယုတ္တိဗေဒ နည်းလမ်း:** ${logicTypeInfo.my}` : '';
    const reasoningHeaderEn = logicTypeInfo ? `\n\n💡 **Reasoning Type:** ${logicTypeInfo.en}` : '';

    // Attribute Description Query
    if (result.type === 'DESCRIPTION' || result.relations) {
        const subject = result.subject || result.nodeId || 'Object';
        const myHeader = `### 🇲🇲 မြန်မာဘာသာ (Burmese)\n**${subject}** နှင့်ပတ်သက်သော လေ့လာဆန်းစစ်ချက်-`;
        const enHeader = `### 🇺🇸 English\nLogical breakdown of **${subject}**:`;
        
        let detailsMy: string[] = [];
        let detailsEn: string[] = [];

        if (result.relations && result.relations.length > 0) {
            const relMap: Record<string, { objects: string[], inheritedFrom: string | null }> = {};
            result.relations.forEach((r: any) => {
                if (!relMap[r.verb]) relMap[r.verb] = { objects: [], inheritedFrom: r.inheritedFrom };
                relMap[r.verb].objects.push(r.targetId);
            });

            Object.entries(relMap).forEach(([verb, info]) => {
                const vMy = this.verbMap[verb]?.my || verb.replace(/_/g, ' ');
                const vEn = this.verbMap[verb]?.en || verb.replace(/_/g, ' ');
                const inhMy = info.inheritedFrom ? ` *(**${info.inheritedFrom}** ထံမှ ဆက်ခံသည်)*` : '';
                const inhEn = info.inheritedFrom ? ` *(Inherited from **${info.inheritedFrom}**)*` : '';
                
                detailsMy.push(`* **${subject}** သည် **${info.objects.join('၊ ')}** ${vMy} ဖြစ်ပါသည်။${inhMy}`);
                detailsEn.push(`* **${subject}** ${vEn} **${info.objects.join(', ')}**. ${inhEn}`);
            });
        }
        
        if (result.groups && result.groups.length > 0) {
            detailsMy.push(`* **${subject}** ကို **${result.groups.join('၊ ')}** အုပ်စုများတွင် ထည့်သွင်းသတ်မှတ်ထားပါသည်။`);
            detailsEn.push(`* **${subject}** is categorized under groups: **${result.groups.join(', ')}**.`);
        }
        
        const output = `${myHeader}\n${detailsMy.join('\n')}${reasoningHeaderMy}\n\n---\n\n${enHeader}\n${detailsEn.join('\n')}${reasoningHeaderEn}`;
        return output;
    }

    // Path / Inference Result
    if (result.path && result.path.length > 0) {
        const first = result.path[0].subject;
        const last = result.path[result.path.length - 1].object;
        const cert = this.qualifyCertainty(result.certainty);
        const pathEx = this.explainPath(result.path);
        
        const myRes = `**${first}** နဲ့ **${last}** အကြားက ဆက်စပ်မှုကို **${cert.my}** ဖော်ထုတ်ပေးလိုက်ပါတယ်။\n\n${pathEx.my}`;
        const enRes = `The engine has **${cert.en}** identified a link between **${first}** and **${last}**.\n\n${pathEx.en}`;
        
        return `### 🧩 Logical Inference Chain\n\n**🇲🇲 Burmese:**\n${myRes}${reasoningHeaderMy}\n\n---\n\n**🇺🇸 English:**\n${enRes}${reasoningHeaderEn}`;
    }

    return "ယုတ္တိဗေဒဆိုင်ရာ ခွဲခြမ်းစိပ်ဖြာမှု ပြီးဆုံးပါပြီ။ (Processing completed.)";
  }
}
