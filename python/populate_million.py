import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from rocks_constructor import RocksConstructor
import time

def populate_million_facts():
    print("မြန်မာဘာသာ အခြေခံ logic များ ထည့်သွင်းနေသည်...")
    db_path = os.environ.get("DB_PATH", "./logic_tree.db")
    constructor = RocksConstructor(db_path=db_path)
    
    start_time = time.time()
    
    # 1. Myanmar Geography & Administration
    print("ပထဝီဝင် ဆိုင်ရာ အချက်အလက်များ...")
    states = ["ရန်ကုန်", "မန္တလေး", "နေပြည်တော်", "ပဲခူး", "ဧရာဝတီ"]
    for state in states:
        constructor.add_isa_relation(state, "မြန်မာနိုင်ငံ")
        constructor.add_triplet(state, "တည်ရှိသည်", "အာရှ", weight=10)
        
    cities = {
        "ရန်ကုန်": ["လှိုင်သာယာ", "အင်းစိန်", "ကမာရွတ်"],
        "မန္တလေး": ["ချမ်းအေးသာစံ", "မဟာအောင်မြေ"],
        "နေပြည်တော်": ["ဇမ္ဗူသီရိ", "ပုဗ္ဗသီရိ"]
    }
    for s, c_list in cities.items():
        for c in c_list:
            constructor.add_isa_relation(c, s)
            constructor.add_triplet(c, "ရှိသည်", "လူဦးရေများ", weight=8)

    # 2. Daily Activities & Logic
    print("နေ့စဉ် လူမှုဘဝ ဆိုင်ရာ logic များ...")
    constructor.add_triplet("လူ", "စားသည်", "ထမင်း", weight=10)
    constructor.add_triplet("လူ", "သောက်သည်", "ရေ", weight=10)
    constructor.add_isa_relation("မောင်မောင်", "လူ")
    constructor.add_isa_relation("အေးအေး", "လူ")
    
    # 3. Massive Synthetic Population for Testing (ビルions level testing)
    print("စမ်းသပ်ရန် အချက်အလက် အမြောက်အမြား ထည့်သွင်းနေသည် (၁ သန်းနီးပါး)...")
    for i in range(1000):
        group = f"လုပ်ငန်းခွင်_{i}"
        constructor.add_isa_relation(group, "အဖွဲ့အစည်း")
        for j in range(1000):
            pt = f"ဝန်ထမ်း_{i}_{j}"
            constructor.add_isa_relation(pt, group)
            constructor.add_triplet(pt, "လုပ်ဆောင်သည်", "တာဝန်", weight=5)

    constructor.flush()
    end_time = time.time()
    
    print("\n--- လုပ်ငန်းစဉ် ပြီးဆုံးပါပြီ ---")
    print(f"ကြာမြင့်ချိန်: {end_time - start_time:.2f} seconds")
    print(f"Database တည်နေရာ: ./logic_tree.db")
    print("နမူနာ Query များ: 'မောင်မောင်' 'ထမင်း' သို့မဟုတ် 'လှိုင်သာယာ' 'အာရှ'")
    
    constructor.close()

if __name__ == "__main__":
    populate_million_facts()
